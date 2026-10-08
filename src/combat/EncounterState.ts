import BaseCharacter from "../character/BaseCharacter.ts";
import type { TConditionState } from "../modifiers/Conditions.ts";
import type { CombatantDefinition, CombatantInput, TargetSnapshot } from "./CombatTypes.ts";
import type { HpChangeEvent } from "./DamageTypes.ts";

export type TimedEffect = {
	kind: string;
	sourceId: string;
	targetId: string;
	createdTurnId: number;
	expires: "start-of-source-next-turn";
	speedReduction?: number;
	attackDisadvantage?: boolean;
};
export type CombatantState = {
	hitPoints: number;
	conditions: TConditionState[];
	classState: Record<string, number | boolean | string>;
};
export type TurnState = {
	id: number;
	ownerId: string;
	bonusActionAvailable: boolean;
	used: Map<string, Set<string>>;
	hitActors: Set<string>;
	attackCounts: Map<string, number>;
};
export class EncounterState {
	private readonly definitions = new Map<string, CombatantDefinition>();
	private readonly states = new Map<string, CombatantState>();
	private readonly effects: TimedEffect[] = [];
	private nextTurnId = 1;
	private currentTurn: TurnState | undefined;
	private nextAttackId = 1;
	constructor(participants: readonly CombatantInput[]) {
		for (const participant of participants) {
			if (!participant.id || this.definitions.has(participant.id))
				throw new Error(`Duplicate or empty combatant ID: ${participant.id}`);
			const original = participant.definition;
			if (!Number.isFinite(original.hitPoints) || original.hitPoints < 0) throw new Error("Invalid starting HP");
			// Preserve passive class methods, but detach all mutable participant/build data.
			const definition = Object.assign(Object.create(Object.getPrototypeOf(original)), original) as CombatantDefinition;
			definition.conditions = structuredClone(original.conditions);
			if (original instanceof BaseCharacter && definition instanceof BaseCharacter) {
				definition.stats = { ...original.stats };
			}
			this.definitions.set(participant.id, definition);
			this.states.set(participant.id, {
				hitPoints: original.hitPoints,
				conditions: structuredClone(original.conditions),
				classState: { ...(participant.initialClassState ?? {}) },
			});
		}
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
		for (let index = this.effects.length - 1; index >= 0; index--) {
			const effect = this.effects[index];
			if (effect && effect.sourceId === ownerId && effect.createdTurnId < id) this.effects.splice(index, 1);
		}
		this.currentTurn = {
			id,
			ownerId,
			bonusActionAvailable: true,
			used: new Map(),
			hitActors: new Set(),
			attackCounts: new Map(),
		};
		return this.currentTurn;
	}
	endTurn(): void {
		this.turn;
		this.currentTurn = undefined;
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
	addEffect(effect: Omit<TimedEffect, "createdTurnId">): void {
		this.definition(effect.sourceId);
		this.definition(effect.targetId);
		if (effect.speedReduction !== undefined && (!Number.isFinite(effect.speedReduction) || effect.speedReduction < 0))
			throw new Error("Invalid speed reduction");
		const entry = { ...effect, createdTurnId: this.turn.id };
		const old = this.effects.findIndex(
			(item) => item.kind === effect.kind && item.sourceId === effect.sourceId && item.targetId === effect.targetId,
		);
		if (old >= 0) this.effects.splice(old, 1, entry);
		else this.effects.push(entry);
	}
	effectsOn(id: string): readonly Readonly<TimedEffect>[] {
		this.definition(id);
		return this.effects.filter((effect) => effect.targetId === id).map((effect) => Object.freeze({ ...effect }));
	}
	effectiveSpeed(id: string): number {
		const byKind = new Map<string, number>();
		for (const effect of this.effectsOn(id))
			byKind.set(effect.kind, Math.max(byKind.get(effect.kind) ?? 0, effect.speedReduction ?? 0));
		return Math.max(0, this.definition(id).speed - [...byKind.values()].reduce((sum, reduction) => sum + reduction, 0));
	}
	hasAttackDisadvantage(id: string): boolean {
		return this.effectsOn(id).some((effect) => effect.attackDisadvantage);
	}
	snapshot(id: string): TargetSnapshot {
		return Object.freeze({
			id,
			armorClass: this.definition(id).armorClass,
			hitPoints: this.state(id).hitPoints,
			speed: this.effectiveSpeed(id),
		});
	}
	applyDamage(targetId: string, damage: number): HpChangeEvent {
		if (!Number.isFinite(damage) || damage < 0) throw new Error("Damage must be finite and nonnegative");
		const state = this.state(targetId);
		const previousHp = state.hitPoints;
		state.hitPoints = Math.max(0, previousHp - damage);
		return {
			targetId,
			previousHp,
			currentHp: state.hitPoints,
			damageTaken: damage,
			hpLost: previousHp - state.hitPoints,
			reducedToZero: previousHp > 0 && state.hitPoints === 0,
		};
	}
}
