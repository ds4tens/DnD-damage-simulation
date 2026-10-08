import BaseCharacter from "../character/BaseCharacter.ts";
import type { DiceRoller } from "../dice/RandomSource.ts";
import { featCombatHooks } from "../feats/Feats.ts";
import { weaponMasteryRegistry } from "../Items/Weapon/WeaponMastery.ts";
import type Weapon from "../Items/Weapon.ts";
import { conditionRegistry } from "../modifiers/Conditions.ts";
import { mergeCombatModifiers, type TCombatModifier } from "../modifiers/Modifiers.ts";
import { type PersistentCombatantState, type RecoveryEvent, recoverResources } from "./CombatResources.ts";
import type {
	AttackActionHandle,
	AttackActionOptions,
	AttackActionResult,
	AttackContext,
	AttackGrant,
	AttackRequest,
	AttackResult,
	AttackSelection,
	AttackSnapshot,
	CleaveCandidate,
	CombatDamageEvent,
	CombatEngineOptions,
	CombatHook,
	DecisionRecord,
	FeatureAction,
	FeatureActionChoice,
	FeatureActionContext,
	FeatureActionResult,
	FeatureActionWindow,
	FeatureSnapshot,
	HitContext,
	HitResult,
	PreparedWeaponAttack,
	RollContext,
	RollKind,
	TurnContext,
	TurnStartResult,
} from "./CombatTypes.ts";
import { allDamageDice, resolveDamage, rollDamageComponents, validateDamagePool } from "./DamageResolver.ts";
import type { DamageComponent, DamagePool, DamageResult, RolledDamageDie } from "./DamageTypes.ts";
import { damageTypes } from "./DamageTypes.ts";
import { EncounterScheduler, type InitiativeOptions } from "./EncounterScheduler.ts";
import type { EncounterState } from "./EncounterState.ts";
import { grantTemporaryHp, heal, resolveDeathSave, stabilize } from "./HitPointsResolver.ts";
import { resolveSavingThrow } from "./SavingThrowResolver.ts";
import type { SavingThrowRequest } from "./SavingThrowTypes.ts";
import { type CombatStrategy, defaultStrategy, freezeSnapshot } from "./Strategy.ts";
import { prepareWeaponAttack, selectWeaponInstance, validateMasterySelections } from "./WeaponCombat.ts";
import {
	hasWeaponMastery,
	masteryAttackModifiers,
	masteryMissComponents,
	resolveMasteryHit,
} from "./WeaponMasteryResolver.ts";

export function collectTurnConditionModifiers(ctx: TurnContext): TCombatModifier[] {
	return ctx.actorState.conditions.flatMap(
		(condition) => conditionRegistry[condition.name].getTurnModifiers?.(condition, ctx) ?? [],
	);
}
export function collectAttackConditionModifiers(ctx: AttackContext): TCombatModifier[] {
	return [
		...ctx.actorState.conditions.flatMap(
			(condition) => conditionRegistry[condition.name].getOutgoingAttackModifiers?.(condition, ctx) ?? [],
		),
		...ctx.targetState.conditions.flatMap(
			(condition) => conditionRegistry[condition.name].getIncomingAttackModifiers?.(condition, ctx) ?? [],
		),
		...(ctx.encounter.hasAttackDisadvantage(ctx.request.actorId)
			? [{ source: "effect.outgoing-disadvantage", attackRoll: { disadvantage: 1 } }]
			: []),
		...(ctx.encounter
			.effectsOn(ctx.request.actorId)
			.some((effect) => effect.attackAdvantageAgainst === ctx.request.targetId)
			? [{ source: "effect.target-advantage", attackRoll: { advantage: 1 } }]
			: []),
	];
}
export function rollAttackD20(
	modifier: TCombatModifier,
	roller: DiceRoller,
	modifyMode?: (
		first: number,
		mode: { advantage: boolean; disadvantage: boolean },
	) => { advantage: boolean; disadvantage: boolean },
): { natural: number; rolls: readonly number[] } {
	let advantage = (modifier.attackRoll?.advantage ?? 0) > 0;
	let disadvantage = (modifier.attackRoll?.disadvantage ?? 0) > 0;
	const first = roller.roll(20);
	if (modifyMode) ({ advantage, disadvantage } = modifyMode(first, { advantage, disadvantage }));
	if (advantage === disadvantage) return { natural: first, rolls: [first] };
	const second = roller.roll(20);
	return { natural: advantage ? Math.max(first, second) : Math.min(first, second), rolls: [first, second] };
}
/** Basic Rules 2024 Rules Glossary, Attack Roll/Critical Hit; verified 2026-10-08. */
export function resolveHit(ctx: AttackContext, modifier: TCombatModifier): HitResult {
	const { natural, rolls } = rollAttackD20(modifier, ctx.roller, ctx.d20Mode);
	const character = ctx.character;
	const bonus =
		ctx.preparedWeapon?.attackBonus ??
		ctx.request.profile?.attackBonus ??
		(character
			? character.getStatModifier(ctx.attackAbility) +
				(ctx.weapon && character.characterClass.isProficientWithWeapon(ctx.weapon)
					? character.getProficiencyBonus()
					: 0)
			: 0);
	const modifierBonus = (modifier.attackRoll?.bonusFns ?? []).reduce((total, fn) => total + fn(ctx), 0);
	const totalAttackRoll = natural + bonus + modifierBonus;
	const isHit = natural === 20 || (natural !== 1 && totalAttackRoll >= ctx.target.armorClass);
	return {
		d20Roll: natural,
		d20Rolls: rolls,
		totalAttackRoll,
		isHit,
		isCrit: isHit && (natural === 20 || Boolean(modifier.hit?.forceCritOnHit)),
	};
}

export class CombatEngine {
	readonly encounter: EncounterState;
	private readonly strategy: CombatStrategy;
	private readonly hooks: readonly CombatHook[];
	private readonly actions = new Map<
		AttackActionHandle,
		{ remaining: number; attacks: AttackResult[]; closed: boolean }
	>();
	private readonly grants = new Map<
		AttackGrant,
		{ request: AttackRequest; signature: string; spent: boolean; cost: "bonus-action" | "reaction" | "free" }
	>();
	private readonly lightOpportunities = new Map<string, { action: AttackActionHandle; sourceInstances: Set<string> }>();
	private nextActionId = 1;
	private nextGrantId = 1;
	private scheduler: EncounterScheduler | undefined;
	private initiativeProcessed = false;
	private readonly damageLedger: CombatDamageEvent[] = [];
	get damageEvents(): readonly CombatDamageEvent[] {
		return freezeSnapshot(structuredClone(this.damageLedger));
	}
	private damage(actorId: string, targetId: string, pool: DamagePool, source: string, critical = false) {
		const result = resolveDamage(this.encounter, targetId, pool, { critical });
		this.damageLedger.push({ actorId, targetId, source, result: structuredClone(result) });
		return result;
	}
	constructor(
		encounter: EncounterState,
		private readonly options: CombatEngineOptions,
	) {
		this.encounter = encounter;
		this.strategy = { ...defaultStrategy, ...options.strategy };
		const customHooks = options.hooks ?? [];
		const hookIds = customHooks.map((hook) => hook.id);
		if (new Set(hookIds).size !== hookIds.length) throw new Error("Duplicate custom combat hook IDs");
		const registered = new Map(featCombatHooks.map((hook) => [hook.id, hook]));
		for (const hook of customHooks) registered.set(hook.id, hook);
		this.hooks = [...registered.values()];
		for (const id of encounter.ids) {
			validateMasterySelections(encounter, id);
			const definition = encounter.definition(id);
			for (const hook of this.hooksForActor(id))
				for (const resource of hook.resourceDefinitions?.(definition) ?? []) encounter.initializeResource(id, resource);
			encounter.validateInitialResources(id);
			if (definition instanceof BaseCharacter)
				for (const feat of definition.feats) {
					if (feat.name !== "ability-score-improvement" && !this.hooks.some((hook) => hook.featName === feat.name))
						throw new Error(`Unsupported combat feat: ${feat.name}`);
				}
		}
	}
	beginTurn(ownerId: string): TurnStartResult {
		if (this.scheduler) throw new Error("Manual and scheduled turns cannot mix");
		this.encounter.setLifecycleMode("manual");
		return this.openTurn(ownerId);
	}
	endTurn(): void {
		if (this.scheduler) throw new Error("Manual and scheduled turns cannot mix");
		this.closeTurn();
	}
	private closeTurn(): void {
		const actorId = this.encounter.turn.ownerId;
		const ctx = this.featureContext(actorId, "after-attack", []);
		for (const hook of this.hooksForActor(actorId)) hook.endTurn?.(ctx);
		this.encounter.endTurn();
	}
	private openTurn(ownerId: string): TurnStartResult {
		const turn = this.encounter.beginTurn(ownerId);
		const state = this.encounter.state(ownerId);
		for (const hook of this.hooksForActor(ownerId)) hook.startTurn?.(this.featureContext(ownerId, "before-attack", []));
		return {
			ownerId,
			turnId: turn.id,
			roundNumber: this.encounter.roundNumber,
			...(state.hitPoints === 0 && state.lifeState === "dying"
				? { deathSave: resolveDeathSave(this.encounter, ownerId, this.options.roller) }
				: {}),
		};
	}
	createScheduler(options: InitiativeOptions = {}): EncounterScheduler {
		return new EncounterScheduler(this, this.options.roller, options);
	}
	assertCanAttachScheduler(): void {
		if (
			this.scheduler ||
			this.encounter.hasActiveTurn ||
			this.encounter.mode === "manual" ||
			this.encounter.ids.length === 0
		)
			throw new Error("Manual and scheduled turns cannot mix or be replaced");
	}
	attachScheduler(scheduler: EncounterScheduler): void {
		if (this.scheduler) throw new Error("Scheduler already attached");
		this.scheduler = scheduler;
	}
	beginScheduledTurn(scheduler: EncounterScheduler, ownerId: string, roundNumber: number): TurnStartResult {
		if (this.scheduler !== scheduler || ownerId !== scheduler.nextActorId || roundNumber !== scheduler.roundNumber)
			throw new Error("Invalid scheduled turn");
		if (this.encounter.hasActiveTurn) throw new Error("End the current global turn first");
		this.encounter.roundNumber = roundNumber;
		return this.openTurn(ownerId);
	}
	endScheduledTurn(scheduler: EncounterScheduler): void {
		if (this.scheduler !== scheduler) throw new Error("Invalid scheduled turn");
		this.closeTurn();
	}
	resolveSavingThrow(request: SavingThrowRequest) {
		let result = resolveSavingThrow(
			this.encounter,
			request,
			this.actorRoller(request.targetId, "saving-throw"),
			(first, mode) => this.modifyD20Mode(request.targetId, "saving-throw", first, mode),
		);
		for (const actorId of this.encounter.ids)
			for (const hook of this.hooksForActor(actorId))
				result =
					hook.afterSavingThrow?.(
						{ ...this.rollContext(actorId, "saving-throw"), request: Object.freeze({ ...request }) },
						result,
					) ?? result;
		return result;
	}
	private hooksForActor(actorId: string): readonly CombatHook[] {
		const actor = this.encounter.definition(actorId);
		return this.hooks.filter(
			(hook) =>
				hook.featName === undefined ||
				(actor instanceof BaseCharacter && actor.feats.some((feat) => feat.name === hook.featName)),
		);
	}
	private featureSnapshot(
		actorId: string,
		window: FeatureSnapshot["window"],
		roll?: FeatureSnapshot["roll"],
	): Readonly<FeatureSnapshot> {
		const active = this.encounter.hasActiveTurn;
		return freezeSnapshot({
			actor: this.encounter.snapshot(actorId),
			targets: this.encounter.ids.filter((id) => id !== actorId).map((id) => this.encounter.snapshot(id)),
			turnId: active ? this.encounter.turn.id : null,
			turnOwnerId: active ? this.encounter.turn.ownerId : null,
			window,
			actionAvailable: active && this.encounter.canUseAction(actorId),
			bonusActionAvailable: active && this.encounter.canUseBonusAction(actorId),
			...(roll ? { roll: { ...roll } } : {}),
		});
	}
	private chooseOption(
		snapshot: Readonly<FeatureSnapshot | AttackSnapshot>,
		featureId: string,
		candidates: readonly string[],
	): string | null {
		const choice = this.strategy.chooseFeatureOption(snapshot, featureId, Object.freeze([...candidates]));
		if (choice !== null && !candidates.includes(choice)) throw new Error(`Invalid feature option: ${featureId}`);
		return choice;
	}
	private rollContext(actorId: string, kind: RollKind, roll?: FeatureSnapshot["roll"]): RollContext {
		return {
			actorId,
			actor: this.encounter.definition(actorId),
			encounter: this.encounter,
			roller: this.options.roller,
			kind,
			useFeature: (id) => {
				const choice = this.strategy.useOptionalFeature(
					this.featureSnapshot(actorId, kind === "initiative" ? "initiative" : "roll", roll),
					id,
				);
				if (typeof choice !== "boolean") throw new Error("Invalid optional feature choice");
				return choice;
			},
			chooseOption: (id, candidates) => this.chooseOption(this.featureSnapshot(actorId, "roll", roll), id, candidates),
		};
	}
	actorRoller(actorId: string, kind: RollKind): DiceRoller {
		return {
			roll: (sides) => {
				let value = this.options.roller.roll(sides);
				for (const hook of this.hooksForActor(actorId)) {
					value =
						hook.rollDie?.(
							this.rollContext(actorId, kind, { sides, value, kind }),
							Object.freeze({ sides, value, kind }),
						) ?? value;
					if (!Number.isSafeInteger(value) || value < 1 || value > sides)
						throw new Error("Invalid feature die replacement");
				}
				return value;
			},
		};
	}
	modifyD20Mode(actorId: string, kind: RollKind, first: number, mode: { advantage: boolean; disadvantage: boolean }) {
		let result = { ...mode };
		for (const hook of this.hooksForActor(actorId))
			result =
				hook.d20Mode?.(
					this.rollContext(actorId, kind, { sides: 20, value: first, kind }),
					first,
					Object.freeze({ ...result }),
				) ?? result;
		if (typeof result.advantage !== "boolean" || typeof result.disadvantage !== "boolean")
			throw new Error("Invalid D20 mode");
		return result;
	}
	processScheduledInitiative(scheduler: EncounterScheduler): void {
		if (this.scheduler !== scheduler || this.initiativeProcessed)
			throw new Error("Invalid or repeated Initiative event");
		this.initiativeProcessed = true;
		for (const result of scheduler.initiative)
			if (result.natural !== null)
				for (const hook of this.hooksForActor(result.actorId))
					hook.onInitiative?.(this.rollContext(result.actorId, "initiative"));
	}
	private featureContext(
		actorId: string,
		window: FeatureActionWindow,
		decisions: DecisionRecord[],
	): FeatureActionContext {
		return {
			actorId,
			actor: this.encounter.definition(actorId),
			encounter: this.encounter,
			roller: this.actorRoller(actorId, "feature"),
			window,
			useFeature: (id) => {
				const choice = this.strategy.useOptionalFeature(this.featureSnapshot(actorId, window), id);
				if (typeof choice !== "boolean") throw new Error("Invalid optional feature choice");
				decisions.push({ feature: id, choice });
				return choice;
			},
			chooseOption: (id, candidates) => {
				const choice = this.chooseOption(this.featureSnapshot(actorId, window), id, candidates);
				decisions.push({ feature: id, choice });
				return choice;
			},
			resolveSavingThrow: (request) => this.resolveSavingThrow(request),
			dealDamage: (targetId, components) =>
				this.damage(
					actorId,
					targetId,
					rollDamageComponents(components, false, this.actorRoller(actorId, "damage")),
					components.map((component) => component.source).join("+"),
				),
			distanceTo: (targetId) => this.options.distanceFor?.(actorId, targetId),
		};
	}
	private featureActions(
		actorId: string,
		window: FeatureActionWindow,
		ctx: FeatureActionContext,
	): readonly FeatureAction[] {
		if (!this.canAct(actorId) || this.encounter.turn.ownerId !== actorId) return [];
		return this.hooksForActor(actorId)
			.flatMap((hook) => hook.featureActions?.(ctx) ?? [])
			.filter(
				(action) =>
					!this.encounter.hasUsed(actorId, `feature-action.${window}.${action.id}`) &&
					(action.cost !== "action" || this.encounter.canUseAction(actorId)) &&
					(action.cost !== "bonus-action" || this.encounter.canUseBonusAction(actorId)) &&
					(action.validate?.(ctx) ?? true),
			);
	}
	resolveFeatureActions(actorId: string, window: FeatureActionWindow): readonly FeatureActionResult[] {
		const results: FeatureActionResult[] = [];
		for (let guard = 0; guard < 32; guard++) {
			const decisions: DecisionRecord[] = [];
			const ctx = this.featureContext(actorId, window, decisions);
			const actions = this.featureActions(actorId, window, ctx);
			if (actions.length === 0) break;
			if (new Set(actions.map((action) => action.id)).size !== actions.length)
				throw new Error("Duplicate feature action IDs");
			const candidates: FeatureActionChoice[] = actions.map(({ id, cost, targetId }) => ({
				id,
				cost,
				...(targetId ? { targetId } : {}),
			}));
			const id = this.strategy.chooseFeatureAction(this.featureSnapshot(actorId, window), freezeSnapshot(candidates));
			if (id === null) break;
			const action = actions.find((candidate) => candidate.id === id);
			if (!action) throw new Error("Invalid feature action choice");
			const attacks: AttackResult[] = [];
			if (action.attack) {
				if (action.cost !== "bonus-action") throw new Error("Feature attack must use Bonus Action");
				const request = this.normalized({ ...action.attack, actorId, actionSource: "bonus-action" });
				this.validateAttack(request);
				const grant = this.issueGrant(request);
				attacks.push(this.resolveSingleAttack({ ...request, grant }, id));
			} else {
				if (action.cost === "action") this.encounter.spendAction(actorId);
				if (action.cost === "bonus-action") this.encounter.spendBonusAction(actorId);
			}
			this.encounter.markUsed(actorId, `feature-action.${window}.${id}`);
			action.execute?.(ctx);
			decisions.push({ feature: id, choice: true });
			results.push({ featureId: id, actorId, decisions, attacks });
		}
		return structuredClone(results);
	}
	exportPersistentState(actorId: string): PersistentCombatantState {
		return freezeSnapshot({
			resources: this.encounter.resourceSnapshot(actorId),
			classState: Object.fromEntries(
				Object.entries(this.encounter.state(actorId).classState).filter(([key]) => key.startsWith("persistent.")),
			),
			spentWeaponInstanceIds: [...this.encounter.state(actorId).spentWeaponInstanceIds],
		});
	}
	recoverResources(actorId: string, event: RecoveryEvent) {
		if (this.encounter.hasActiveTurn) throw new Error("Recovery requires no active turn");
		return recoverResources(this.encounter, actorId, event);
	}
	advanceElapsedTime(minutes: number): void {
		if (this.encounter.hasActiveTurn || !Number.isFinite(minutes) || minutes < 0)
			throw new Error("Invalid elapsed time advance");
		for (const id of this.encounter.ids) {
			const state = this.encounter.state(id).classState;
			if (minutes >= 10) {
				state.raging = false;
				delete state["barbarian.rageExpiresOwnTurn"];
			}
		}
	}
	standUp(actorId: string): boolean {
		if (this.encounter.turn.ownerId !== actorId || !this.canAct(actorId)) return false;
		const speed = this.encounter.effectiveSpeed(actorId);
		if (speed <= 0 || this.encounter.turn.movementSpent + speed / 2 > speed) return false;
		const state = this.encounter.state(actorId);
		if (!state.conditions.some((condition) => condition.name === "prone")) return false;
		this.encounter.turn.movementSpent += speed / 2;
		state.conditions = state.conditions.filter((condition) => condition.name !== "prone");
		return true;
	}
	heal(targetId: string, amount: number) {
		return heal(this.encounter, targetId, amount);
	}
	grantTemporaryHp(targetId: string, amount: number, replace: boolean) {
		return grantTemporaryHp(this.encounter, targetId, amount, replace);
	}
	stabilize(actorId: string, targetId: string, options: { distance?: number } = {}) {
		this.encounter.definition(actorId);
		const target = this.encounter.state(targetId);
		const distance = this.options.distanceFor?.(actorId, targetId) ?? options.distance;
		if (!this.canAct(actorId)) throw new Error("Actor cannot take actions");
		if (!this.encounter.canUseAction(actorId)) throw new Error("Action unavailable");
		if (actorId === targetId || target.hitPoints !== 0 || target.lifeState !== "dying")
			throw new Error("Stabilization requires a dying creature at 0 HP");
		if (distance === undefined || !Number.isFinite(distance) || distance < 0 || distance > 5)
			throw new Error("Stabilization requires a target within 5 feet");
		this.encounter.spendAction(actorId);
		return stabilize(this.encounter, actorId, targetId, this.options.roller);
	}
	beginAttackAction(actorId: string): AttackActionHandle {
		this.encounter.definition(actorId);
		if (!this.canAct(actorId)) throw new Error("Actor cannot take actions");
		if (!this.encounter.canUseAction(actorId)) throw new Error("Action unavailable");
		const actor = this.encounter.definition(actorId);
		const remaining = actor instanceof BaseCharacter ? actor.characterClass.getAttackCount(actor.level) : 1;
		if (!Number.isSafeInteger(remaining) || remaining < 1) throw new Error("Invalid attack count");
		const handle = Object.freeze({
			id: `turn-${this.encounter.turn.id}:action-${this.nextActionId++}`,
			actorId,
			turnId: this.encounter.turn.id,
		});
		this.encounter.spendAction(actorId);
		this.actions.set(handle, { remaining, attacks: [], closed: false });
		return handle;
	}
	attackInAction(action: AttackActionHandle, selection: AttackSelection): AttackResult {
		return this.resolveSingleAttack({ ...selection, actorId: action.actorId, actionSource: "attack-action", action });
	}
	finishAttackAction(action: AttackActionHandle): AttackActionResult {
		const entry = this.actionEntry(action);
		entry.closed = true;
		const total = (attack: AttackResult): number =>
			(attack.damage?.appliedDamage ?? 0) +
			(attack.additionalDamage ?? []).reduce((sum, damage) => sum + damage.appliedDamage, 0) +
			attack.triggeredAttacks.reduce((sum, child) => sum + total(child), 0);
		return structuredClone({
			totalDamage: entry.attacks.reduce((sum, attack) => sum + total(attack), 0),
			attacks: entry.attacks,
		});
	}
	private actionEntry(action: AttackActionHandle): { remaining: number; attacks: AttackResult[]; closed: boolean } {
		const entry = this.actions.get(action);
		if (
			!entry ||
			entry.closed ||
			action.turnId !== this.encounter.turn.id ||
			action.actorId !== this.encounter.turn.ownerId
		)
			throw new Error("Invalid or expired Attack action handle");
		return entry;
	}
	grantScenarioReaction(input: Omit<AttackRequest, "grant">): AttackGrant {
		if (!this.options.allowScenarioReactions) throw new Error("Scenario reactions require explicit opt-in");
		if (input.actionSource !== "reaction") throw new Error("Scenario grants authorize only Reactions");
		const request = this.normalized(input);
		this.validateAttack(request);
		return this.issueGrant({ ...request, attackOrigin: "scenario" });
	}
	private issueGrant(request: AttackRequest): AttackGrant {
		const grant = Object.freeze({
			id: `turn-${this.encounter.turn.id}:grant-${this.nextGrantId++}`,
			actorId: request.actorId,
			turnId: this.encounter.turn.id,
		});
		const authorized = {
			...request,
			actionId:
				request.attackOrigin === "cleave" || request.attackOrigin === "nick"
					? (request.actionId ?? grant.id)
					: grant.id,
		};
		this.grants.set(grant, {
			request: authorized,
			signature: this.grantSignature(authorized),
			spent: false,
			cost:
				request.attackOrigin === "cleave" || request.attackOrigin === "nick"
					? "free"
					: request.actionSource === "reaction"
						? "reaction"
						: "bonus-action",
		});
		return grant;
	}
	private grantSignature(request: AttackRequest): string {
		return JSON.stringify([
			request.actorId,
			request.targetId,
			request.actionSource,
			request.mode,
			request.weaponInstanceId,
			request.weapon,
			request.profile,
			request.distance,
			request.ability,
			request.grip,
			request.equip,
		]);
	}
	private validateAttack(request: AttackRequest): void {
		this.encounter.turn;
		if (!["melee", "ranged", "thrown"].includes(request.mode)) throw new Error("Invalid attack mode");
		if (!this.isAttackLegal(request)) throw new Error("Illegal attack request");
		if (!this.canAct(request.actorId)) throw new Error("Actor cannot take actions");
		if (request.profile) {
			if (!Number.isFinite(request.profile.attackBonus) || !Array.isArray(request.profile.damage))
				throw new Error("Invalid attack profile");
			this.validateComponents(request.profile.damage);
		}
	}
	private validateAuthority(request: AttackRequest): void {
		if (request.grant) {
			const entry = this.grants.get(request.grant);
			if (
				!entry ||
				entry.spent ||
				request.grant.turnId !== this.encounter.turn.id ||
				entry.request.actorId !== request.actorId ||
				entry.request.targetId !== request.targetId ||
				entry.request.actionSource !== request.actionSource ||
				entry.request.mode !== request.mode ||
				entry.request.weapon !== request.weapon ||
				entry.request.profile !== request.profile ||
				entry.signature !== this.grantSignature(request)
			)
				throw new Error("Invalid or expired attack grant");
			if (entry.cost === "bonus-action" && !this.encounter.canUseBonusAction(request.actorId))
				throw new Error("Bonus Action unavailable");
			if (entry.cost === "reaction" && !this.encounter.canUseReaction(request.actorId))
				throw new Error("Reaction unavailable");
			return;
		}
		if (
			request.actionSource !== "attack-action" ||
			(request.attackOrigin !== undefined && request.attackOrigin !== "primary")
		)
			throw new Error("An issued attack grant is required");
		if (request.action) {
			const entry = this.actionEntry(request.action);
			if (request.actorId !== request.action.actorId || entry.remaining < 1)
				throw new Error("Attack action slot unavailable");
			if (request.attackOrigin !== undefined && request.attackOrigin !== "primary")
				throw new Error("An issued attack grant is required");
		} else if (!this.encounter.canUseAction(request.actorId)) throw new Error("Action unavailable");
	}
	private validateComponents(components: readonly DamageComponent[]): void {
		const ids = new Set<string>();
		for (const component of components) {
			if (
				!component ||
				typeof component.id !== "string" ||
				!component.id ||
				ids.has(component.id) ||
				typeof component.source !== "string" ||
				!component.source ||
				!Number.isFinite(component.flatBonus) ||
				!damageTypes.includes(component.damageType) ||
				!["weapon", "class", "feat", "unarmed", "other"].includes(component.origin) ||
				typeof component.doublesOnCrit !== "boolean" ||
				!Array.isArray(component.dice)
			)
				throw new Error("Invalid damage component");
			ids.add(component.id);
			for (const sides of component.dice)
				if (!Number.isSafeInteger(sides) || sides < 1) throw new Error("Invalid damage die");
		}
	}
	private validateWeapon(weapon: Weapon): void {
		if (
			typeof weapon.name !== "string" ||
			!weapon.name ||
			!["melee", "ranged"].includes(weapon.category) ||
			!Number.isSafeInteger(weapon.reach) ||
			weapon.reach < 0 ||
			!Number.isSafeInteger(weapon.flatDamage) ||
			!damageTypes.includes(weapon.damageType) ||
			!Array.isArray(weapon.damage) ||
			!Array.isArray(weapon.properties)
		)
			throw new Error("Invalid weapon metadata");
		if (
			weapon.properties.some(
				(property) =>
					![
						"heavy",
						"reach",
						"two-handed",
						"versatile",
						"light",
						"finesse",
						"thrown",
						"ammunition",
						"loading",
					].includes(property),
			) ||
			!["simple", "martial"].includes(weapon.proficiencyCategory) ||
			typeof weapon.oneHandedWhenMounted !== "boolean"
		)
			throw new Error("Invalid weapon properties");
		for (const die of weapon.damage)
			if (!Number.isSafeInteger(die.maxValue) || die.maxValue < 1) throw new Error("Invalid weapon damage die");
		if (
			weapon.range &&
			(!Number.isSafeInteger(weapon.range.normal) ||
				!Number.isSafeInteger(weapon.range.long) ||
				weapon.range.normal < 0 ||
				weapon.range.long < weapon.range.normal)
		)
			throw new Error("Invalid weapon range");
		if (weapon.versatileDamage?.some((sides) => !Number.isSafeInteger(sides) || sides < 1))
			throw new Error("Invalid versatile damage");
		if (weapon.weaponMastery !== undefined && !weaponMasteryRegistry[weapon.weaponMastery])
			throw new Error("Invalid Weapon Mastery");
	}
	private normalized(request: AttackRequest): AttackRequest {
		const actor = this.encounter.definition(request.actorId);
		if (request.weapon) this.validateWeapon(request.weapon);
		const weapon =
			request.weapon ??
			(request.weaponInstanceId
				? this.encounter.weaponInstance(request.actorId, request.weaponInstanceId).weapon
				: request.profile === undefined && actor instanceof BaseCharacter
					? actor.weapon
					: undefined);
		const distance = this.options.distanceFor?.(request.actorId, request.targetId) ?? request.distance;
		const granted = request.grant ? this.grants.get(request.grant)?.request : undefined;
		const actionId =
			granted?.actionId ??
			request.action?.id ??
			(request.attackOrigin === "cleave" || request.attackOrigin === "nick" ? request.actionId : undefined) ??
			(request.actionSource === "attack-action"
				? `turn-${this.encounter.hasActiveTurn ? this.encounter.turn.id : 0}:action-${this.nextActionId}`
				: "eligibility");
		return {
			...request,
			actionId,
			...(granted ? { attackOrigin: granted.attackOrigin ?? "scenario" } : {}),
			...(weapon === undefined ? {} : { weapon }),
			...(distance === undefined ? {} : { distance }),
		};
	}
	private prepared(request: AttackRequest): PreparedWeaponAttack | undefined {
		if (!request.weapon && !request.weaponInstanceId) return undefined;
		if (request.weapon) this.validateWeapon(request.weapon);
		this.validateWeapon(selectWeaponInstance(this.encounter, request).weapon);
		const prepared = prepareWeaponAttack(this.encounter, request);
		this.validateComponents(prepared.damageComponents);
		if (!Number.isFinite(prepared.attackBonus)) throw new Error("Invalid weapon attack bonus");
		if (prepared.loadingKey && this.encounter.hasActiveTurn && this.encounter.turn.loadingUsed.has(prepared.loadingKey))
			throw new Error("Loading weapon already used for this action");
		return prepared;
	}
	isAttackLegal(input: AttackRequest): boolean {
		this.encounter.definition(input.actorId);
		this.encounter.definition(input.targetId);
		try {
			const request = this.normalized(input);
			if (
				request.actorId === request.targetId ||
				this.encounter.state(request.targetId).lifeState === "dead" ||
				!["melee", "ranged", "thrown"].includes(request.mode)
			)
				return false;
			if (request.distance !== undefined && (!Number.isFinite(request.distance) || request.distance < 0)) return false;
			if (!request.weapon && !request.weaponInstanceId && !request.profile) return false;
			if (
				request.profile?.damage.some((component) => component.origin === "unarmed") &&
				(request.mode !== "melee" || (request.distance ?? 5) > 5)
			)
				return false;
			this.prepared(request);
			return this.options.canAttack?.(request, this.encounter) ?? true;
		} catch {
			return false;
		}
	}
	private snapshot(ctx: AttackContext): Readonly<AttackSnapshot> {
		const turn = this.encounter.turn;
		return freezeSnapshot({
			actorId: ctx.request.actorId,
			targetId: ctx.request.targetId,
			turnId: turn.id,
			turnOwnerId: turn.ownerId,
			actionSource: ctx.request.actionSource,
			isOwnTurn: ctx.isOwnTurn,
			bonusActionAvailable: this.encounter.canUseBonusAction(ctx.request.actorId),
			actor: this.encounter.snapshot(ctx.request.actorId),
			target: this.encounter.snapshot(ctx.request.targetId),
			...(ctx.weapon
				? { weapon: { name: ctx.weapon.name, category: ctx.weapon.category, properties: [...ctx.weapon.properties] } }
				: {}),
			...(ctx.hit ? { hit: structuredClone(ctx.hit) } : {}),
			attackAbility: ctx.attackAbility,
			attackIndexInTurn: ctx.attackIndexInTurn,
		});
	}
	private context(request: AttackRequest, attackIndexInTurn: number, prepared?: PreparedWeaponAttack): AttackContext {
		const attacker = this.encounter.definition(request.actorId);
		const character = attacker instanceof BaseCharacter ? attacker : undefined;
		const ctx: AttackContext = {
			encounter: this.encounter,
			roller: this.actorRoller(request.actorId, "attack"),
			attacker,
			character,
			canSee: (observerId, targetId) =>
				this.options.canSee?.(observerId, targetId) ??
				!this.encounter.state(targetId).conditions.some((condition) => condition.name === "invisible"),
			attackAbility:
				prepared?.attackAbility ?? request.ability ?? (request.mode === "ranged" ? "dexterity" : "strength"),
			...(prepared ? { preparedWeapon: prepared } : {}),
			target: this.encounter.definition(request.targetId),
			actorState: this.encounter.state(request.actorId),
			targetState: this.encounter.state(request.targetId),
			request,
			weapon: request.weapon,
			attackIndexInTurn,
			hasHitOccurredThisTurn: this.encounter.turn.hitActors.has(request.actorId),
			...(request.distance === undefined ? {} : { distance: request.distance }),
			decisions: [],
			isOwnTurn: this.encounter.turn.ownerId === request.actorId,
			hasUsed: (feature) => this.encounter.hasUsed(request.actorId, feature),
			markUsed: (feature) => this.encounter.markUsed(request.actorId, feature),
			chooseOption: (feature, candidates) => {
				const choice = this.chooseOption(this.snapshot(ctx), feature, candidates);
				ctx.decisions.push({ feature, choice });
				return choice;
			},
			resolveSavingThrow: (input) => this.resolveSavingThrow(input),
			dealDamage: (targetId, components) =>
				this.damage(
					request.actorId,
					targetId,
					rollDamageComponents(components, false, this.actorRoller(request.actorId, "damage")),
					components.map((component) => component.source).join("+"),
				),
			d20Mode: (first, mode) => this.modifyD20Mode(request.actorId, "attack", first, mode),
			useFeature: (feature) => {
				const choice = this.strategy.useFeature(this.snapshot(ctx), feature);
				if (typeof choice !== "boolean") throw new Error("Strategy must return a boolean feature choice");
				ctx.decisions.push({ feature, choice });
				return choice;
			},
			chooseWeaponRoll: (candidates) => {
				if (candidates.length === 0) throw new Error("No weapon roll candidates");
				const detached = freezeSnapshot(structuredClone(candidates));
				const choice = this.strategy.chooseWeaponRoll(this.snapshot(ctx), detached);
				if (!Number.isSafeInteger(choice) || choice < 0 || choice >= candidates.length)
					throw new Error("Invalid weapon roll choice");
				ctx.decisions.push({
					feature: "savage-attacker.weapon-roll",
					choice: String(choice),
					candidates: structuredClone(candidates),
				});
				return choice;
			},
			choosePunctureDie: (dice) => {
				const choice = this.strategy.choosePunctureDie(this.snapshot(ctx), freezeSnapshot(structuredClone(dice)));
				this.validateDieChoice(dice, choice);
				ctx.decisions.push({ feature: "piercer.puncture", choice });
				return choice;
			},
			choosePiercerCriticalDie: (dice) => {
				if (dice.length === 0) return null;
				const use = this.strategy.applyPiercerCritical(this.snapshot(ctx));
				if (typeof use !== "boolean") throw new Error("Strategy must return a boolean critical choice");
				const choice = use
					? this.strategy.choosePiercerCriticalDie(this.snapshot(ctx), freezeSnapshot(structuredClone(dice)))
					: null;
				this.validateDieChoice(dice, choice);
				ctx.decisions.push({ feature: "piercer.enhanced-critical", choice });
				return choice;
			},
			chooseHewTarget: () => {
				const targets = this.encounter.ids
					.filter(
						(targetId) =>
							this.encounter.state(targetId).lifeState !== "dead" &&
							this.isAttackLegal(
								this.normalized({
									actorId: request.actorId,
									targetId,
									mode: request.mode,
									actionSource: "bonus-action",
									...(request.weapon ? { weapon: request.weapon } : {}),
									...(request.weaponInstanceId ? { weaponInstanceId: request.weaponInstanceId } : {}),
									...(request.profile ? { profile: request.profile } : {}),
									ability: ctx.attackAbility,
									...(request.grip ? { grip: request.grip } : {}),
									...(request.distance !== undefined ? { distance: request.distance } : {}),
								}),
							),
					)
					.map((id) => this.encounter.snapshot(id));
				if (targets.length === 0) return null;
				const choice = this.strategy.chooseHewTarget(this.snapshot(ctx), freezeSnapshot(targets));
				if (choice !== null && (typeof choice !== "string" || !targets.some((target) => target.id === choice)))
					throw new Error("Invalid Hew target choice");
				ctx.decisions.push({ feature: "great-weapon-master.hew", choice });
				return choice;
			},
			addEffect: (effect) => this.encounter.addEffect(effect),
		};
		return ctx;
	}
	private validateDieChoice(dice: readonly RolledDamageDie[], choice: string | null): void {
		if (choice !== null && (typeof choice !== "string" || !dice.some((die) => die.id === choice)))
			throw new Error("Invalid damage die choice");
	}
	private activeHooks(ctx: AttackContext): readonly CombatHook[] {
		return this.hooks.filter(
			(hook) =>
				(hook.featName === undefined || ctx.character?.feats.some((feat) => feat.name === hook.featName)) &&
				(hook.applies?.(ctx) ?? true),
		);
	}
	private canAct(actorId: string): boolean {
		if (this.encounter.state(actorId).lifeState !== "alive") return false;
		const actor = this.encounter.definition(actorId);
		const ctx: TurnContext = { actor, actorState: this.encounter.state(actorId), encounter: this.encounter };
		return [
			...(actor instanceof BaseCharacter ? actor.characterClass.getTurnModifiers(ctx) : []),
			...collectTurnConditionModifiers(ctx),
		].every((modifier) => modifier.turn?.canAct?.(ctx) ?? true);
	}
	private weaponComponents(ctx: AttackContext): readonly DamageComponent[] {
		if (ctx.request.profile) return ctx.request.profile.damage.filter((component) => component.origin === "weapon");
		if (ctx.preparedWeapon) return ctx.preparedWeapon.damageComponents;
		if (!ctx.weapon) return [];
		return [
			{
				id: "weapon",
				source: `weapon.${ctx.weapon.name}`,
				origin: "weapon",
				damageType: ctx.weapon.damageType,
				dice: ctx.weapon.damage.map((die) => die.maxValue),
				flatBonus: ctx.character?.getStatModifier(ctx.attackAbility) ?? 0,
				doublesOnCrit: true,
			},
		];
	}
	resolveSingleAttack(input: AttackRequest, source: string = "attack"): AttackResult {
		let request = this.normalized(input);
		this.validateAttack(request);
		this.validateAuthority(request);
		const prepared = this.prepared(request);
		let implicitAction: AttackActionHandle | undefined;
		if (request.grant) {
			const grant = this.grants.get(request.grant);
			if (!grant) throw new Error("Invalid attack grant");
			if (grant.cost === "bonus-action") this.encounter.spendBonusAction(request.actorId);
			if (grant.cost === "reaction") this.encounter.spendReaction(request.actorId);
			grant.spent = true;
			request = {
				...request,
				actionId: grant.request.actionId ?? request.grant.id,
				attackOrigin: grant.request.attackOrigin ?? "scenario",
			};
		} else {
			if (!request.action) implicitAction = this.beginAttackAction(request.actorId);
			const action = request.action ?? implicitAction;
			if (!action) throw new Error("Attack action unavailable");
			this.actionEntry(action).remaining--;
			request = { ...request, action, actionId: action.id, attackOrigin: "primary" };
		}
		if (prepared) {
			this.encounter.state(request.actorId).hands = { ...prepared.nextHands };
			if (prepared.loadingKey) this.encounter.turn.loadingUsed.add(prepared.loadingKey);
			if (prepared.thrownInstanceId)
				this.encounter.state(request.actorId).spentWeaponInstanceIds.add(prepared.thrownInstanceId);
			request = { ...request, weapon: prepared.instance.weapon, weaponInstanceId: prepared.instance.id };
		}
		const attack = this.encounter.nextAttack(request.actorId);
		const ctx = this.context(request, attack.index, prepared);
		const additionalDamage: DamageResult[] = [];
		const savingThrows: ReturnType<typeof resolveSavingThrow>[] = [];
		const originalDealDamage = ctx.dealDamage;
		ctx.dealDamage = (targetId, components) => {
			const result = originalDealDamage(targetId, components);
			additionalDamage.push(result);
			return result;
		};
		ctx.resolveSavingThrow = (request) => {
			const result = this.resolveSavingThrow(request);
			savingThrows.push(result);
			return result;
		};
		const hooks = this.activeHooks(ctx);
		const classModifiers = ctx.character?.characterClass.getAttackModifiers(ctx) ?? [];
		const modifier = mergeCombatModifiers([
			...classModifiers,
			...masteryAttackModifiers(ctx),
			...(prepared?.attackModifiers ?? []),
			...collectAttackConditionModifiers(ctx),
			...hooks.flatMap((hook) => hook.attackModifiers?.(ctx) ?? []),
		]);
		this.encounter.consumeAttackEffects(request.actorId, request.targetId);
		let hit = resolveHit(ctx, modifier);
		for (const hook of hooks) {
			ctx.hit = hit;
			hit = hook.afterHit?.({ ...ctx, hit }) ?? hit;
		}
		ctx.hit = hit;
		const hitCtx: HitContext = { ...ctx, hit };
		let pool: DamagePool = [];
		if (hit.isHit) {
			pool = rollDamageComponents(this.weaponComponents(ctx), hit.isCrit, this.actorRoller(request.actorId, "damage"));
			for (const hook of hooks) pool = hook.weaponDamage?.(hitCtx, pool) ?? pool;
			const classDamageModifiers = ctx.character?.characterClass.getDamageRollModifiers(hitCtx) ?? [];
			const extraComponents: DamageComponent[] = [
				...(request.profile?.damage.filter((component) => component.origin !== "weapon") ?? []),
				...[modifier, ...classDamageModifiers].flatMap(
					(item) => item.damageRoll?.componentFns?.flatMap((fn) => fn(hitCtx)) ?? [],
				),
				...hooks.flatMap((hook) => hook.damageComponents?.(hitCtx) ?? []),
			];
			pool = [
				...pool,
				...rollDamageComponents(extraComponents, hit.isCrit, this.actorRoller(request.actorId, "damage")),
			];
			for (const hook of hooks) pool = hook.additionalCriticalDice?.(hitCtx, pool) ?? pool;
			for (const hook of hooks) pool = hook.afterDamageRoll?.(hitCtx, pool) ?? pool;
			validateDamagePool(pool);
			const postModifiers = ctx.character?.characterClass.getPostHitModifiers(hitCtx) ?? [];
			for (const fn of [modifier, ...postModifiers].flatMap((item) => item.postHit?.effectFns ?? [])) fn(hitCtx);
			for (const hook of hooks) hook.onHit?.(hitCtx, pool);
		} else {
			const missComponents = [
				...(modifier.miss?.componentFns?.flatMap((fn) => fn(hitCtx)) ?? []),
				...masteryMissComponents(ctx),
			];
			pool = rollDamageComponents(missComponents, false, this.actorRoller(request.actorId, "damage"));
		}
		const damage =
			hit.isHit || pool.length > 0
				? this.damage(request.actorId, request.targetId, pool, source, hit.isCrit)
				: undefined;
		if (hit.isHit) this.encounter.turn.hitActors.add(request.actorId);
		const triggeredAttacks: AttackResult[] = [];
		const result: AttackResult = {
			mode: request.mode,
			...(ctx.weapon
				? { weapon: { name: ctx.weapon.name, category: ctx.weapon.category, properties: [...ctx.weapon.properties] } }
				: {}),
			attackId: attack.id,
			actorId: request.actorId,
			targetId: request.targetId,
			turnId: this.encounter.turn.id,
			actionSource: request.actionSource,
			...(request.actionId ? { actionId: request.actionId } : {}),
			attackOrigin: request.attackOrigin ?? "primary",
			...(request.parentAttackId ? { parentAttackId: request.parentAttackId } : {}),
			roundNumber: this.encounter.roundNumber,
			source,
			attackIndexInTurn: attack.index,
			hit,
			...(damage === undefined ? {} : { damage }),
			decisions: ctx.decisions,
			triggeredAttacks,
			limitations: [...(ctx.character?.characterClass.unsupportedFeatures ?? []), ...(prepared?.limitations ?? [])],
			...(prepared ? { weaponInstanceId: prepared.instance.id } : {}),
			additionalDamage,
			savingThrows,
		};
		const mastery = resolveMasteryHit(ctx, result, { save: (save) => this.resolveSavingThrow(save) });
		for (const effect of mastery.effects ?? []) this.encounter.addEffect(effect);
		for (const condition of mastery.addConditions ?? []) {
			if (!ctx.targetState.conditions.some((existing) => existing.name === condition.name))
				ctx.targetState.conditions.push({ ...condition });
		}
		if (mastery.savingThrows) savingThrows.push(...mastery.savingThrows);
		if (
			request.action &&
			request.actionSource === "attack-action" &&
			request.attackOrigin === "primary" &&
			prepared?.instance.weapon.properties.includes("light")
		) {
			const prior = this.lightOpportunities.get(request.actorId);
			const sourceInstances = prior?.action === request.action ? prior.sourceInstances : new Set<string>();
			sourceInstances.add(prepared.instance.id);
			this.lightOpportunities.set(request.actorId, { action: request.action, sourceInstances });
		}
		const triggers = new Map<string, () => void>();
		if (mastery.cleaveEligible)
			triggers.set("weaponMastery.cleave", () => {
				const cleave = this.resolveCleave(ctx, result);
				if (cleave) triggeredAttacks.push(cleave);
			});
		for (const hook of hooks)
			if (hook.afterAttack)
				triggers.set(hook.id, () => {
					for (const trigger of hook.afterAttack?.(ctx, result) ?? []) {
						if (!this.encounter.canUseBonusAction(request.actorId))
							throw new Error("Triggered Bonus Action unavailable");
						const triggeredRequest = this.followupRequest(ctx, result, trigger.targetId, "hew", "bonus-action");
						if (!this.isAttackLegal(triggeredRequest)) continue;
						const grant = this.issueGrant(triggeredRequest);
						triggeredAttacks.push(this.resolveSingleAttack({ ...triggeredRequest, grant }, trigger.source));
					}
				});
		const ids = [...triggers.keys()];
		const ordered = this.strategy.orderTriggers(this.snapshot(ctx), freezeSnapshot([...ids]));
		if (
			!Array.isArray(ordered) ||
			ordered.length !== ids.length ||
			new Set(ordered).size !== ids.length ||
			ordered.some((id) => !triggers.has(id))
		)
			throw new Error("Invalid simultaneous trigger order");
		for (const id of ordered) triggers.get(id)?.();
		if (savingThrows.length === 0) delete result.savingThrows;
		if (additionalDamage.length === 0) delete result.additionalDamage;
		// Keep outcome data detached from later hooks/turns and strategy references.
		if (request.action && !request.grant) this.actionEntry(request.action).attacks.push(result);
		if (implicitAction) this.finishAttackAction(implicitAction);
		return structuredClone(result);
	}
	private followupRequest(
		ctx: AttackContext,
		parent: AttackResult,
		targetId: string,
		origin: "cleave" | "hew",
		actionSource: AttackRequest["actionSource"],
		distance?: number,
	): AttackRequest {
		return this.normalized({
			actorId: ctx.request.actorId,
			targetId,
			mode: ctx.request.mode,
			actionSource,
			attackOrigin: origin,
			parentAttackId: parent.attackId,
			...(origin === "cleave" && ctx.request.actionId ? { actionId: ctx.request.actionId } : {}),
			...(ctx.request.weaponInstanceId ? { weaponInstanceId: ctx.request.weaponInstanceId } : {}),
			...(ctx.weapon ? { weapon: ctx.weapon } : {}),
			...(ctx.request.profile ? { profile: ctx.request.profile } : {}),
			ability: ctx.attackAbility,
			...(ctx.request.grip ? { grip: ctx.request.grip } : {}),
			...(distance !== undefined
				? { distance }
				: ctx.request.distance !== undefined
					? { distance: ctx.request.distance }
					: {}),
		});
	}
	private resolveCleave(ctx: AttackContext, parent: AttackResult): AttackResult | undefined {
		if (ctx.hasUsed("weaponMastery.cleave") || !ctx.weapon || !this.canAct(ctx.request.actorId)) return undefined;
		const supplied =
			this.options.cleaveCandidates?.(ctx.request.actorId, ctx.request.targetId, this.encounter.turn.id) ?? [];
		const legal: CleaveCandidate[] = [];
		for (const candidate of supplied) {
			if (
				!this.encounter.ids.includes(candidate.targetId) ||
				candidate.targetId === ctx.request.actorId ||
				candidate.targetId === ctx.request.targetId ||
				this.encounter.state(candidate.targetId).lifeState === "dead" ||
				!Number.isFinite(candidate.distanceToActor) ||
				candidate.distanceToActor < 0 ||
				candidate.distanceToActor > ctx.weapon.reach ||
				!Number.isFinite(candidate.distanceToPrimary) ||
				candidate.distanceToPrimary < 0 ||
				candidate.distanceToPrimary > 5
			)
				continue;
			const between = this.options.distanceFor?.(ctx.request.targetId, candidate.targetId);
			if (between !== undefined && (!Number.isFinite(between) || between < 0 || between > 5)) continue;
			const request = this.followupRequest(
				ctx,
				parent,
				candidate.targetId,
				"cleave",
				ctx.request.actionSource,
				candidate.distanceToActor,
			);
			// A Cleave retains its parent's action identity and does not authorize a new budget.
			if (ctx.request.actionId) request.actionId = ctx.request.actionId;
			if (this.isAttackLegal(request) && !legal.some((item) => item.targetId === candidate.targetId))
				legal.push({ ...candidate });
		}
		if (legal.length === 0 || !ctx.useFeature("weaponMastery.cleave")) return undefined;
		const targets = freezeSnapshot(legal.map((candidate) => this.encounter.snapshot(candidate.targetId)));
		const selected = this.strategy.chooseCleaveTarget(this.snapshot(ctx), targets);
		if (selected !== null && !legal.some((candidate) => candidate.targetId === selected))
			throw new Error("Invalid Cleave target choice");
		ctx.decisions.push({ feature: "weaponMastery.cleave.target", choice: selected });
		const candidate = legal.find((item) => item.targetId === selected);
		if (!candidate) return undefined;
		const request = this.followupRequest(
			ctx,
			parent,
			candidate.targetId,
			"cleave",
			ctx.request.actionSource,
			candidate.distanceToActor,
		);
		if (ctx.request.actionId) if (ctx.request.actionId) request.actionId = ctx.request.actionId;
		this.validateAttack(request);
		ctx.markUsed("weaponMastery.cleave");
		const grant = this.issueGrant(request);
		return this.resolveSingleAttack({ ...request, grant }, "weaponMastery.cleave");
	}
	resolveLightAttack(actorId: string, selection: AttackSelection, options: { useNick?: boolean } = {}): AttackResult {
		const opportunity = this.lightOpportunities.get(actorId);
		if (
			!opportunity ||
			opportunity.action.turnId !== this.encounter.turn.id ||
			this.encounter.turn.ownerId !== actorId ||
			this.encounter.hasUsed(actorId, "weapon.light")
		)
			throw new Error("Light attack unavailable");
		const useNick = options.useNick ?? false;
		if (useNick) this.actionEntry(opportunity.action);
		else if (!this.encounter.canUseBonusAction(actorId)) throw new Error("Bonus Action unavailable");
		let request = this.normalized({
			...selection,
			actorId,
			actionSource: useNick ? "attack-action" : "bonus-action",
			attackOrigin: useNick ? "nick" : "light",
			...(useNick ? { actionId: opportunity.action.id, action: opportunity.action } : {}),
		});
		if (useNick) request.actionId = opportunity.action.id;
		this.validateAttack(request);
		const prepared = this.prepared(request);
		if (
			!prepared ||
			!prepared.instance.weapon.properties.includes("light") ||
			![...opportunity.sourceInstances].some((id) => id !== prepared.instance.id)
		)
			throw new Error("Light requires a different Light weapon instance");
		if (
			useNick &&
			(prepared.instance.weapon.weaponMastery !== "nick" ||
				!hasWeaponMastery(this.encounter, actorId, prepared.instance.weapon))
		)
			throw new Error("Nick requires selected mastery on the additional Light weapon");
		const grant = this.issueGrant(request);
		request = this.normalized({ ...request, grant });
		this.validateAuthority(request);
		this.encounter.markUsed(actorId, "weapon.light");
		const result = this.resolveSingleAttack(request, useNick ? "weaponMastery.nick" : "weapon.light");
		const entry = this.actions.get(opportunity.action);
		if (entry && !entry.closed) entry.attacks.push(result);
		return result;
	}
	private actionCandidates(
		action: AttackActionHandle | undefined,
		actorId: string,
		preferredTargetId: string,
		options: AttackActionOptions,
	): AttackSelection[] {
		const actor = this.encounter.definition(actorId);
		const preferred = options.weapon ?? (actor instanceof BaseCharacter ? actor.weapon : undefined);
		const inventory = [...this.encounter.weapons(actorId)].sort(
			(left, right) => Number(right.weapon.name === preferred?.name) - Number(left.weapon.name === preferred?.name),
		);
		const targets = this.encounter.ids
			.filter((id) => id !== actorId)
			.sort((left, right) => Number(right === preferredTargetId) - Number(left === preferredTargetId));
		const primary = action ? this.actionEntry(action).remaining > 0 : true;
		const opportunity = this.lightOpportunities.get(actorId);
		const additional = !!action && opportunity?.action === action && !this.encounter.hasUsed(actorId, "weapon.light");
		const candidates: AttackSelection[] = [];
		if (options.unarmed && primary && actor instanceof BaseCharacter) {
			for (const targetId of targets) {
				const selection: AttackSelection = {
					targetId,
					mode: "melee",
					ability: "strength",
					profile: {
						attackBonus: actor.getStatModifier("strength") + actor.getProficiencyBonus(),
						damage: [
							{
								id: "unarmed",
								source: "unarmed.strike",
								origin: "unarmed",
								damageType: "bludgeoning",
								dice: [],
								flatBonus: 1 + actor.getStatModifier("strength"),
								doublesOnCrit: false,
							},
						],
					},
					...(options.distance !== undefined ? { distance: options.distance } : {}),
				};
				if (
					this.isAttackLegal({
						...selection,
						actorId,
						actionSource: "attack-action",
						...(action ? { action, actionId: action.id } : {}),
					})
				)
					candidates.push(selection);
			}
			return candidates;
		}
		for (const origin of ["primary", "nick", "light"] as const) {
			if (origin === "primary" && !primary) continue;
			if (origin !== "primary" && !additional) continue;
			if (origin === "light" && !this.encounter.canUseBonusAction(actorId)) continue;
			for (const instance of inventory) {
				if (this.encounter.state(actorId).spentWeaponInstanceIds.has(instance.id)) continue;
				if (
					origin !== "primary" &&
					(!instance.weapon.properties.includes("light") ||
						![...(opportunity?.sourceInstances ?? [])].some((id) => id !== instance.id))
				)
					continue;
				if (
					origin === "nick" &&
					(instance.weapon.weaponMastery !== "nick" || !hasWeaponMastery(this.encounter, actorId, instance.weapon))
				)
					continue;
				for (const targetId of targets) {
					const mode =
						instance.weapon.name === preferred?.name
							? (options.mode ?? instance.weapon.category)
							: instance.weapon.category;
					const selection: AttackSelection = {
						targetId,
						weaponInstanceId: instance.id,
						mode,
						attackOrigin: origin,
						...(options.distance !== undefined ? { distance: options.distance } : {}),
					};
					const hands = this.encounter.state(actorId).hands;
					if (hands.left !== instance.id && hands.right !== instance.id && origin !== "light") {
						const hand = hands.left === null ? "left" : hands.right === null ? "right" : undefined;
						if (hand) selection.equip = { kind: "draw", when: "before", weaponInstanceId: instance.id, hand };
					}
					const request: AttackRequest = {
						...selection,
						actorId,
						actionSource: origin === "light" ? "bonus-action" : "attack-action",
						...(action ? { action, actionId: action.id } : {}),
					};
					if (this.isAttackLegal(request)) candidates.push(selection);
				}
			}
		}
		return candidates;
	}
	legalAttackCandidates(
		actorId: string,
		targetId: string,
		options: AttackActionOptions = {},
	): readonly AttackSelection[] {
		return freezeSnapshot(structuredClone(this.actionCandidates(undefined, actorId, targetId, options)));
	}
	resolveAttackAction(actorId: string, targetId: string, options: AttackActionOptions = {}): AttackActionResult {
		if (this.encounter.turn.ownerId !== actorId) throw new Error("Attack action requires the actor's own turn");
		if (!this.canAct(actorId)) return { totalDamage: 0, attacks: [] };
		const actor = this.encounter.definition(actorId);
		if (!(actor instanceof BaseCharacter)) throw new Error("Monster attack actions require an explicit profile");
		if (!this.encounter.canUseAction(actorId)) throw new Error("Action unavailable");
		if (this.actionCandidates(undefined, actorId, targetId, options).length === 0)
			return { totalDamage: 0, attacks: [] };
		const initial = this.normalized({
			actorId,
			targetId,
			actionSource: "attack-action",
			mode: options.mode ?? (options.weapon ?? actor.weapon).category,
			...(options.weapon ? { weapon: options.weapon } : {}),
			...(options.distance !== undefined ? { distance: options.distance } : {}),
		});
		if (!options.unarmed) this.validateAttack(initial);
		let action: AttackActionHandle | undefined;
		while (true) {
			const candidates = this.actionCandidates(action, actorId, targetId, options);
			const remaining = action ? this.actionEntry(action).remaining : actor.characterClass.getAttackCount(actor.level);
			const snapshot = freezeSnapshot({
				actor: this.encounter.snapshot(actorId),
				targets: this.encounter.ids.filter((id) => id !== actorId).map((id) => this.encounter.snapshot(id)),
				turnId: this.encounter.turn.id,
				actionId: action?.id ?? initial.actionId ?? "pending",
				remainingPrimaryAttacks: remaining,
				bonusActionAvailable: this.encounter.canUseBonusAction(actorId),
				reactionAvailable: this.encounter.canUseReaction(actorId),
				effects: this.encounter.ids.flatMap((id) => this.encounter.effectsOn(id)),
			});
			const choice = this.strategy.chooseNextAttack(snapshot, freezeSnapshot(structuredClone(candidates)));
			if (choice === null) break;
			if (!Number.isSafeInteger(choice) || choice < 0 || choice >= candidates.length)
				throw new Error("Invalid next attack choice");
			const selection = candidates[choice];
			if (!selection) throw new Error("Invalid next attack choice");
			if (!action) action = this.beginAttackAction(actorId);
			if (selection.attackOrigin === "nick" || selection.attackOrigin === "light")
				this.resolveLightAttack(actorId, selection, { useNick: selection.attackOrigin === "nick" });
			else this.attackInAction(action, selection);
		}
		return action ? this.finishAttackAction(action) : { totalDamage: 0, attacks: [] };
	}
}

/** Explicit encounter callers may use these function entry points instead of methods. */
export function resolveSingleAttack(engine: CombatEngine, request: AttackRequest): AttackResult {
	return engine.resolveSingleAttack(request);
}
export function resolveAttackTurn(
	engine: CombatEngine,
	actorId: string,
	targetId: string,
	options?: AttackActionOptions,
): AttackActionResult {
	return engine.resolveAttackAction(actorId, targetId, options);
}
export { allDamageDice };
