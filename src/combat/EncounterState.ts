import BaseCharacter from "../character/BaseCharacter.ts";
import type { TConditionState } from "../modifiers/Conditions.ts";
import type { CombatantDefinition, CombatantInput, HandState, TargetSnapshot, WeaponInstance } from "./CombatTypes.ts";
import type { HpChangeEvent } from "./DamageTypes.ts";
import { applyDamage, initializeHitPoints } from "./HitPointsResolver.ts";
import type { DeathSaveState, LifeState, ZeroHpBehavior } from "./HitPointTypes.ts";
import { freezeSnapshot } from "./Strategy.ts";

export type EffectExpiry = { boundary: "start" | "end"; combatantId: string; turnOccurrence: number };

export type TimedEffect = {
	id: string;
	kind: string;
	sourceId: string;
	targetId: string;
	createdTurnId: number;
	expires: "start-of-source-next-turn" | EffectExpiry;
	speedReduction?: number;
	attackDisadvantage?: boolean;
	attackAdvantageAgainst?: string;
	consumeOnAttack?: { actorId: string; targetId?: string };
};
export type EffectInput = Omit<TimedEffect, "createdTurnId" | "id">;
export type CombatantState = {
	hitPoints: number;
	temporaryHp: number;
	lifeState: LifeState;
	deathSaves: DeathSaveState;
	reactionAvailable: boolean;
	ownTurnCount: number;
	hands: HandState;
	spentWeaponInstanceIds: Set<string>;
	conditions: TConditionState[];
	classState: Record<string, number | boolean | string>;
};
export type TurnState = {
	id: number;
	ownerId: string;
	actionAvailable: boolean;
	bonusActionAvailable: boolean;
	used: Map<string, Set<string>>;
	hitActors: Set<string>;
	attackCounts: Map<string, number>;
	loadingUsed: Set<string>;
};
export class EncounterState {
	private readonly definitions = new Map<string, CombatantDefinition>();
	private readonly states = new Map<string, CombatantState>();
	private readonly effects: TimedEffect[] = [];
	private readonly inventories = new Map<string, WeaponInstance[]>();
	private readonly masteries = new Map<string, readonly string[]>();
	private readonly zeroHpBehaviors = new Map<string, ZeroHpBehavior>();
	private nextEffectId = 1;
	private lifecycleMode: "manual" | "scheduled" | undefined;
	roundNumber = 0;
	private nextTurnId = 1;
	private currentTurn: TurnState | undefined;
	private nextAttackId = 1;
	constructor(participants: readonly CombatantInput[]) {
		for (const participant of participants) {
			if (!participant.id || this.definitions.has(participant.id))
				throw new Error(`Duplicate or empty combatant ID: ${participant.id}`);
			const original = participant.definition;
			if (!Number.isFinite(original.hitPoints) || original.hitPoints < 0) throw new Error("Invalid starting HP");
			// Clone the complete supported definition graph: weapon dice, metadata and
			// class proficiency weapons must not alias the build or another encounter.
			// Preserve prototypes without rerunning constructors (and applying ASI again).
			const definition = cloneDefinition(original);
			this.definitions.set(participant.id, definition);
			const hitPoints = participant.initialHitPoints ?? original.hitPoints;
			const temporaryHp = participant.initialTemporaryHp ?? 0;
			if (!Number.isFinite(hitPoints) || hitPoints < 0 || hitPoints > original.hitPoints)
				throw new Error("Invalid starting HP");
			if (!Number.isFinite(temporaryHp) || temporaryHp < 0) throw new Error("Invalid Temporary HP");
			const inventory = cloneDefinition([
				...(participant.weapons ??
					(definition instanceof BaseCharacter ? [{ id: `${participant.id}:weapon`, weapon: definition.weapon }] : [])),
			]);
			if (inventory.some((item) => !item.id) || new Set(inventory.map((item) => item.id)).size !== inventory.length)
				throw new Error("Duplicate or empty weapon instance ID");
			this.inventories.set(participant.id, inventory);
			if (participant.masteredWeaponIds !== undefined && participant.masteredWeaponNames !== undefined)
				throw new Error("Choose one Weapon Mastery selection format");
			this.masteries.set(
				participant.id,
				Object.freeze([...(participant.masteredWeaponIds ?? participant.masteredWeaponNames ?? [])]),
			);
			const zeroHpBehavior =
				participant.zeroHpBehavior ?? (definition instanceof BaseCharacter ? "death-saves" : "die");
			this.zeroHpBehaviors.set(participant.id, zeroHpBehavior);
			const hands = structuredClone(participant.initialHands ?? { left: inventory[0]?.id ?? null, right: null });
			for (const id of Object.values(hands))
				if (id !== null && id !== "$shield" && !inventory.some((item) => item.id === id))
					throw new Error("Unknown held weapon instance");
			this.states.set(participant.id, {
				hitPoints,
				temporaryHp,
				lifeState: hitPoints > 0 ? "alive" : zeroHpBehavior === "die" ? "dead" : "dying",
				deathSaves: { successes: 0, failures: 0 },
				reactionAvailable: true,
				ownTurnCount: 0,
				hands,
				spentWeaponInstanceIds: new Set(),
				conditions: structuredClone(original.conditions),
				classState: { ...(participant.initialClassState ?? {}) },
			});
		}
		for (const id of this.ids) initializeHitPoints(this, id);
	}
	get hasActiveTurn(): boolean {
		return this.currentTurn !== undefined;
	}
	get mode(): "manual" | "scheduled" | undefined {
		return this.lifecycleMode;
	}
	weapons(actorId: string): readonly WeaponInstance[] {
		this.definition(actorId);
		return this.inventories.get(actorId) ?? [];
	}
	provideWeaponInstance(actorId: string, instance: WeaponInstance): void {
		this.definition(actorId);
		const inventory = this.inventories.get(actorId);
		if (!inventory || !instance.id || inventory.some((item) => item.id === instance.id))
			throw new Error("Weapon instance IDs cannot be reused");
		inventory.push(cloneDefinition(instance));
	}
	weaponInstance(actorId: string, instanceId: string): WeaponInstance {
		const instance = this.weapons(actorId).find((item) => item.id === instanceId);
		if (!instance) throw new Error(`Unknown weapon instance: ${instanceId}`);
		return instance;
	}
	masteredWeaponNames(actorId: string): readonly string[] {
		this.definition(actorId);
		return this.masteries.get(actorId) ?? [];
	}
	zeroHpBehavior(actorId: string): ZeroHpBehavior {
		this.definition(actorId);
		return this.zeroHpBehaviors.get(actorId) ?? "die";
	}
	setLifecycleMode(mode: "manual" | "scheduled"): void {
		if (this.lifecycleMode !== undefined && this.lifecycleMode !== mode)
			throw new Error("Manual and scheduled turns cannot mix");
		this.lifecycleMode = mode;
	}
	get ids(): readonly string[] {
		return [...this.definitions.keys()];
	}
	definition(id: string): CombatantDefinition {
		const definition = this.definitions.get(id);
		if (!definition) throw new Error(`Unknown combatant: ${id}`);
		return definition;
	}
	state(id: string): CombatantState {
		const state = this.states.get(id);
		if (!state) throw new Error(`Unknown combatant: ${id}`);
		return state;
	}
	get turn(): TurnState {
		if (!this.currentTurn) throw new Error("An active global turn is required");
		return this.currentTurn;
	}
	beginTurn(ownerId: string): TurnState {
		this.definition(ownerId);
		if (this.currentTurn) throw new Error("End the current global turn before beginning another");
		const id = this.nextTurnId++;
		this.state(ownerId).ownTurnCount++;
		this.state(ownerId).reactionAvailable = true;
		for (let index = this.effects.length - 1; index >= 0; index--) {
			const effect = this.effects[index];
			if (effect && this.expiresAt(effect, ownerId, "start", id)) this.effects.splice(index, 1);
		}
		this.currentTurn = {
			id,
			ownerId,
			actionAvailable: true,
			bonusActionAvailable: true,
			used: new Map(),
			hitActors: new Set(),
			attackCounts: new Map(),
			loadingUsed: new Set(),
		};
		return this.currentTurn;
	}
	endTurn(): void {
		const turn = this.turn;
		for (let index = this.effects.length - 1; index >= 0; index--) {
			const effect = this.effects[index];
			if (effect && this.expiresAt(effect, turn.ownerId, "end", turn.id)) this.effects.splice(index, 1);
		}
		this.currentTurn = undefined;
	}
	private expiresAt(effect: TimedEffect, ownerId: string, boundary: "start" | "end", turnId: number): boolean {
		if (effect.expires === "start-of-source-next-turn")
			return boundary === "start" && effect.sourceId === ownerId && effect.createdTurnId < turnId;
		return (
			effect.expires.combatantId === ownerId &&
			effect.expires.boundary === boundary &&
			this.state(ownerId).ownTurnCount >= effect.expires.turnOccurrence
		);
	}
	canUseAction(actorId: string): boolean {
		return this.turn.ownerId === actorId && this.turn.actionAvailable;
	}
	spendAction(actorId: string): void {
		if (!this.canUseAction(actorId)) throw new Error("Action unavailable");
		this.turn.actionAvailable = false;
	}
	canUseReaction(actorId: string): boolean {
		return this.state(actorId).reactionAvailable;
	}
	spendReaction(actorId: string): void {
		if (!this.canUseReaction(actorId)) throw new Error("Reaction unavailable");
		this.state(actorId).reactionAvailable = false;
	}
	hasUsed(actorId: string, featureId: string): boolean {
		return this.turn.used.get(actorId)?.has(featureId) ?? false;
	}
	markUsed(actorId: string, featureId: string): void {
		this.definition(actorId);
		const used = this.turn.used.get(actorId) ?? new Set<string>();
		if (used.has(featureId)) throw new Error(`Feature already used this turn: ${featureId}`);
		used.add(featureId);
		this.turn.used.set(actorId, used);
	}
	canUseBonusAction(actorId: string): boolean {
		return this.turn.ownerId === actorId && this.turn.bonusActionAvailable;
	}
	spendBonusAction(actorId: string): void {
		if (!this.canUseBonusAction(actorId)) throw new Error("Bonus Action unavailable");
		this.turn.bonusActionAvailable = false;
	}
	nextAttack(actorId: string): { id: string; index: number } {
		const index = this.turn.attackCounts.get(actorId) ?? 0;
		this.turn.attackCounts.set(actorId, index + 1);
		return { id: `attack-${this.nextAttackId++}`, index };
	}
	addEffect(effect: EffectInput): void {
		this.definition(effect.sourceId);
		this.definition(effect.targetId);
		if (effect.speedReduction !== undefined && (!Number.isFinite(effect.speedReduction) || effect.speedReduction < 0))
			throw new Error("Invalid speed reduction");
		if (effect.expires !== "start-of-source-next-turn") {
			this.definition(effect.expires.combatantId);
			if (
				!Number.isSafeInteger(effect.expires.turnOccurrence) ||
				effect.expires.turnOccurrence < 0 ||
				(effect.expires.boundary !== "start" && effect.expires.boundary !== "end")
			)
				throw new Error("Invalid effect expiry");
		}
		if (effect.attackAdvantageAgainst) this.definition(effect.attackAdvantageAgainst);
		if (effect.consumeOnAttack) {
			this.definition(effect.consumeOnAttack.actorId);
			if (effect.consumeOnAttack.targetId) this.definition(effect.consumeOnAttack.targetId);
		}
		const entry = { ...structuredClone(effect), id: `effect-${this.nextEffectId++}`, createdTurnId: this.turn.id };
		const old = this.effects.findIndex(
			(item) =>
				item.kind === effect.kind &&
				item.sourceId === effect.sourceId &&
				item.targetId === effect.targetId &&
				item.attackAdvantageAgainst === effect.attackAdvantageAgainst,
		);
		if (old >= 0) this.effects.splice(old, 1, entry);
		else this.effects.push(entry);
	}
	consumeAttackEffects(actorId: string, targetId: string): void {
		for (let index = this.effects.length - 1; index >= 0; index--) {
			const condition = this.effects[index]?.consumeOnAttack;
			if (condition?.actorId === actorId && (condition.targetId === undefined || condition.targetId === targetId))
				this.effects.splice(index, 1);
		}
	}
	effectsOn(id: string): readonly Readonly<TimedEffect>[] {
		this.definition(id);
		return freezeSnapshot(structuredClone(this.effects.filter((effect) => effect.targetId === id)));
	}
	effectiveSpeed(id: string): number {
		const conditions = this.state(id).conditions;
		if (
			this.state(id).lifeState === "dead" ||
			conditions.some((condition) => ["grappled", "restrained", "paralyzed", "unconscious"].includes(condition.name))
		)
			return 0;
		const exhaustion = Math.max(
			0,
			...conditions.filter((condition) => condition.name === "exhaustion").map((condition) => condition.level ?? 1),
		);
		const byKind = new Map<string, number>();
		for (const effect of this.effectsOn(id))
			byKind.set(effect.kind, Math.max(byKind.get(effect.kind) ?? 0, effect.speedReduction ?? 0));
		return Math.max(
			0,
			this.definition(id).speed - 5 * exhaustion - [...byKind.values()].reduce((sum, reduction) => sum + reduction, 0),
		);
	}
	hasAttackDisadvantage(id: string): boolean {
		return this.effectsOn(id).some((effect) => effect.attackDisadvantage);
	}
	snapshot(id: string): TargetSnapshot {
		return Object.freeze({
			id,
			armorClass: this.definition(id).armorClass,
			conditions: Object.freeze(this.state(id).conditions.map((condition) => Object.freeze({ ...condition }))),
			hitPoints: this.state(id).hitPoints,
			speed: this.effectiveSpeed(id),
			lifeState: this.state(id).lifeState,
			temporaryHp: this.state(id).temporaryHp,
		});
	}
	applyDamage(targetId: string, damage: number, options: { critical?: boolean } = {}): HpChangeEvent {
		return applyDamage(this, targetId, damage, options);
	}
}

/** Passive methods stay on their prototypes; every nested data object is detached. */
function cloneDefinition<T>(value: T, seen: WeakMap<object, unknown> = new WeakMap()): T {
	if (value === null || typeof value !== "object") return value;
	if (seen.has(value)) return seen.get(value) as T;
	if (value instanceof Map) {
		const copy = new Map();
		seen.set(value, copy);
		for (const [key, entry] of value) copy.set(cloneDefinition(key, seen), cloneDefinition(entry, seen));
		return copy as T;
	}
	if (value instanceof Set) {
		const copy = new Set();
		seen.set(value, copy);
		for (const entry of value) copy.add(cloneDefinition(entry, seen));
		return copy as T;
	}
	const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
	seen.set(value, copy);
	for (const key of Reflect.ownKeys(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor) continue;
		if ("value" in descriptor) descriptor.value = cloneDefinition(descriptor.value, seen);
		Object.defineProperty(copy, key, descriptor);
	}
	if (Object.isFrozen(value)) Object.freeze(copy);
	return copy as T;
}
