import BaseCharacter from "../character/BaseCharacter.ts";
import type { DiceRoller } from "../dice/RandomSource.ts";
import { weaponMasteryRegistry } from "../Items/Weapon/WeaponMastery.ts";
import type Weapon from "../Items/Weapon.ts";
import { conditionRegistry } from "../modifiers/Conditions.ts";
import { mergeCombatModifiers, type TCombatModifier } from "../modifiers/Modifiers.ts";
import type {
	AttackActionResult,
	AttackContext,
	AttackRequest,
	AttackResult,
	AttackSnapshot,
	CombatEngineOptions,
	CombatHook,
	HitContext,
	HitResult,
	TurnContext,
} from "./CombatTypes.ts";
import { allDamageDice, resolveDamage, rollDamageComponents, validateDamagePool } from "./DamageResolver.ts";
import type { DamageComponent, DamagePool, RolledDamageDie } from "./DamageTypes.ts";
import type { EncounterState } from "./EncounterState.ts";
import { type CombatStrategy, defaultStrategy, freezeSnapshot } from "./Strategy.ts";

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
	];
}
export function rollAttackD20(
	modifier: TCombatModifier,
	roller: DiceRoller,
): { natural: number; rolls: readonly number[] } {
	const advantage = (modifier.attackRoll?.advantage ?? 0) > 0;
	const disadvantage = (modifier.attackRoll?.disadvantage ?? 0) > 0;
	const first = roller.roll(20);
	if (advantage === disadvantage) return { natural: first, rolls: [first] };
	const second = roller.roll(20);
	return { natural: advantage ? Math.max(first, second) : Math.min(first, second), rolls: [first, second] };
}
/** Basic Rules 2024 Rules Glossary, Attack Roll/Critical Hit; verified 2026-10-08. */
export function resolveHit(ctx: AttackContext, modifier: TCombatModifier): HitResult {
	const { natural, rolls } = rollAttackD20(modifier, ctx.roller);
	const character = ctx.character;
	const bonus =
		ctx.request.profile?.attackBonus ??
		(character
			? character.getStatModifier(character.weaponPrimaryStat) +
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
	constructor(
		encounter: EncounterState,
		private readonly options: CombatEngineOptions,
	) {
		this.encounter = encounter;
		this.strategy = { ...defaultStrategy, ...options.strategy };
		this.hooks = [...(options.hooks ?? [])];
		const hookIds = this.hooks.map((hook) => hook.id);
		if (new Set(hookIds).size !== hookIds.length) throw new Error("Duplicate combat hook IDs");
		for (const id of encounter.ids) {
			const definition = encounter.definition(id);
			if (definition instanceof BaseCharacter)
				for (const feat of definition.feats) {
					if (feat.name !== "ability-score-improvement" && !this.hooks.some((hook) => hook.featName === feat.name))
						throw new Error(`Unsupported combat feat: ${feat.name}`);
				}
		}
	}
	private normalized(request: AttackRequest): AttackRequest {
		const actor = this.encounter.definition(request.actorId);
		const weapon =
			request.weapon ?? (request.profile === undefined && actor instanceof BaseCharacter ? actor.weapon : undefined);
		const distance = this.options.distanceFor?.(request.actorId, request.targetId) ?? request.distance;
		return { ...request, ...(weapon === undefined ? {} : { weapon }), ...(distance === undefined ? {} : { distance }) };
	}
	isAttackLegal(request: AttackRequest): boolean {
		this.encounter.definition(request.actorId);
		this.encounter.definition(request.targetId);
		if (request.actorId === request.targetId) return false;
		if (request.distance !== undefined && (!Number.isFinite(request.distance) || request.distance < 0)) return false;
		if (!request.weapon && !request.profile) return false;
		const weapon = request.weapon;
		if (weapon) {
			if (request.mode === "melee" && weapon.category !== "melee") return false;
			if (request.mode === "ranged" && weapon.category !== "ranged") return false;
			if (request.mode === "thrown" && !weapon.properties.includes("thrown")) return false;
			if (request.distance !== undefined) {
				if (request.mode === "melee" && request.distance > weapon.reach) return false;
				if (request.mode !== "melee" && weapon.range && request.distance > weapon.range.long) return false;
			}
		}
		return this.options.canAttack?.(request, this.encounter) ?? true;
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
		});
	}
	private context(request: AttackRequest, attackIndexInTurn: number): AttackContext {
		const attacker = this.encounter.definition(request.actorId);
		const character = attacker instanceof BaseCharacter ? attacker : undefined;
		const ctx: AttackContext = {
			encounter: this.encounter,
			roller: this.options.roller,
			attacker,
			character,
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
					.filter((targetId) =>
						this.isAttackLegal(this.normalized({ ...request, targetId, actionSource: "bonus-action" })),
					)
					.map((id) => this.encounter.snapshot(id));
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
		const actor = this.encounter.definition(actorId);
		const ctx: TurnContext = { actor, actorState: this.encounter.state(actorId), encounter: this.encounter };
		return [
			...(actor instanceof BaseCharacter ? actor.characterClass.getTurnModifiers(ctx) : []),
			...collectTurnConditionModifiers(ctx),
		].every((modifier) => modifier.turn?.canAct?.(ctx) ?? true);
	}
	private weaponComponents(ctx: AttackContext): readonly DamageComponent[] {
		if (ctx.request.profile) return ctx.request.profile.damage.filter((component) => component.origin === "weapon");
		if (!ctx.weapon) return [];
		return [
			{
				id: "weapon",
				source: `weapon.${ctx.weapon.name}`,
				origin: "weapon",
				damageType: ctx.weapon.damageType,
				dice: ctx.weapon.damage.map((die) => die.maxValue),
				flatBonus: ctx.character?.getDamageBonus() ?? 0,
				doublesOnCrit: true,
			},
		];
	}
	resolveSingleAttack(input: AttackRequest, source: string = "attack"): AttackResult {
		const request = this.normalized(input);
		this.encounter.turn;
		if (!this.isAttackLegal(request)) throw new Error("Illegal attack request");
		if (!this.canAct(request.actorId)) throw new Error("Actor cannot take actions");
		if (request.actionSource === "bonus-action") this.encounter.spendBonusAction(request.actorId);
		const attack = this.encounter.nextAttack(request.actorId);
		const ctx = this.context(request, attack.index);
		const hooks = this.activeHooks(ctx);
		const classModifiers = ctx.character?.characterClass.getAttackModifiers(ctx) ?? [];
		const mastery = ctx.weapon?.weaponMastery;
		const masteryModifiers: TCombatModifier[] = [];
		if (mastery && ctx.weapon && ctx.character?.characterClass.canUseWeaponMastery(ctx.weapon)) {
			const rule = weaponMasteryRegistry[mastery];
			if (!rule.supported) throw new Error(`Unsupported Weapon Mastery: ${mastery}`);
			masteryModifiers.push(...(rule.getModifiers?.(mastery, ctx) ?? []));
		}
		const rangeModifiers: TCombatModifier[] =
			ctx.weapon?.range &&
			request.mode !== "melee" &&
			request.distance !== undefined &&
			request.distance > ctx.weapon.range.normal
				? [{ source: "weapon.long-range", attackRoll: { disadvantage: 1 } }]
				: [];
		const modifier = mergeCombatModifiers([
			...classModifiers,
			...masteryModifiers,
			...rangeModifiers,
			...collectAttackConditionModifiers(ctx),
			...hooks.flatMap((hook) => hook.attackModifiers?.(ctx) ?? []),
		]);
		const hit = resolveHit(ctx, modifier);
		ctx.hit = hit;
		const hitCtx: HitContext = { ...ctx, hit };
		let pool: DamagePool = [];
		if (hit.isHit) {
			pool = rollDamageComponents(this.weaponComponents(ctx), hit.isCrit, this.options.roller);
			for (const hook of hooks) pool = hook.weaponDamage?.(hitCtx, pool) ?? pool;
			const classDamageModifiers = ctx.character?.characterClass.getDamageRollModifiers(hitCtx) ?? [];
			const extraComponents: DamageComponent[] = [
				...(request.profile?.damage.filter((component) => component.origin !== "weapon") ?? []),
				...[modifier, ...classDamageModifiers].flatMap(
					(item) => item.damageRoll?.componentFns?.flatMap((fn) => fn(hitCtx)) ?? [],
				),
				...hooks.flatMap((hook) => hook.damageComponents?.(hitCtx) ?? []),
			];
			pool = [...pool, ...rollDamageComponents(extraComponents, hit.isCrit, this.options.roller)];
			for (const hook of hooks) pool = hook.additionalCriticalDice?.(hitCtx, pool) ?? pool;
			for (const hook of hooks) pool = hook.afterDamageRoll?.(hitCtx, pool) ?? pool;
			validateDamagePool(pool);
			const postModifiers = ctx.character?.characterClass.getPostHitModifiers(hitCtx) ?? [];
			for (const fn of [modifier, ...postModifiers].flatMap((item) => item.postHit?.effectFns ?? [])) fn(hitCtx);
			for (const hook of hooks) hook.onHit?.(hitCtx, pool);
		} else {
			const missComponents = modifier.miss?.componentFns?.flatMap((fn) => fn(hitCtx)) ?? [];
			pool = rollDamageComponents(missComponents, false, this.options.roller);
		}
		const damage = hit.isHit || pool.length > 0 ? resolveDamage(this.encounter, request.targetId, pool) : undefined;
		if (hit.isHit) this.encounter.turn.hitActors.add(request.actorId);
		const triggeredAttacks: AttackResult[] = [];
		const result: AttackResult = {
			attackId: attack.id,
			actorId: request.actorId,
			targetId: request.targetId,
			turnId: this.encounter.turn.id,
			actionSource: request.actionSource,
			source,
			attackIndexInTurn: attack.index,
			hit,
			...(damage === undefined ? {} : { damage }),
			decisions: ctx.decisions,
			triggeredAttacks,
			limitations: ctx.character?.characterClass.unsupportedFeatures ?? [],
		};
		for (const hook of hooks) {
			const triggers = hook.afterAttack?.(ctx, result) ?? [];
			for (const trigger of triggers) {
				if (!this.encounter.canUseBonusAction(request.actorId)) throw new Error("Triggered Bonus Action unavailable");
				// No retained trigger queue: decision and action resolve before any following primary attack.
				triggeredAttacks.push(
					this.resolveSingleAttack(
						{ ...request, targetId: trigger.targetId, actionSource: "bonus-action" },
						trigger.source,
					),
				);
			}
		}
		// Keep outcome data detached from later hooks/turns and strategy references.
		return structuredClone(result);
	}
	resolveAttackAction(
		actorId: string,
		targetId: string,
		options: { mode?: AttackRequest["mode"]; weapon?: Weapon; distance?: number } = {},
	): AttackActionResult {
		if (this.encounter.turn.ownerId !== actorId) throw new Error("Attack action requires the actor's own turn");
		if (!this.canAct(actorId)) return { totalDamage: 0, attacks: [] };
		const actor = this.encounter.definition(actorId);
		if (!(actor instanceof BaseCharacter)) throw new Error("Monster attack actions require an explicit profile");
		const weapon = options.weapon ?? actor.weapon;
		const attacks: AttackResult[] = [];
		const count = actor.characterClass.getAttackCount(actor.level);
		for (let index = 0; index < count; index++)
			attacks.push(
				this.resolveSingleAttack({
					actorId,
					targetId,
					actionSource: "attack-action",
					actionId: `turn-${this.encounter.turn.id}:attack-action`,
					mode: options.mode ?? weapon.category,
					weapon,
					...(options.distance === undefined ? {} : { distance: options.distance }),
				}),
			);
		const total = (attack: AttackResult): number =>
			(attack.damage?.appliedDamage ?? 0) + attack.triggeredAttacks.reduce((sum, entry) => sum + total(entry), 0);
		return { totalDamage: attacks.reduce((sum, attack) => sum + total(attack), 0), attacks };
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
	options?: { mode?: AttackRequest["mode"]; weapon?: Weapon; distance?: number },
): AttackActionResult {
	return engine.resolveAttackAction(actorId, targetId, options);
}
export { allDamageDice };
