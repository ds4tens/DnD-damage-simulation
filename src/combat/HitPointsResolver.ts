import { damageTypeNames } from "../character/CombatantData.ts";
import type { DiceRoller } from "../dice/RandomSource.ts";
import { exhaustionPenalty } from "../modifiers/Conditions.ts";
import type { DamageByType, HpChangeEvent } from "./DamageTypes.ts";
import type { EncounterState } from "./EncounterState.ts";
import type { DeathSaveResult, HealingEvent, StabilizeResult, TemporaryHpEvent } from "./HitPointTypes.ts";
import { rollD20Test } from "./SavingThrowResolver.ts";

const hpUnconsciousSource = "combat.zero-hp";
function validAmount(amount: number): void {
	if (!Number.isFinite(amount) || amount < 0) throw new Error("Amount must be finite and nonnegative");
}
function resetDeathSaves(encounter: EncounterState, targetId: string): void {
	encounter.state(targetId).deathSaves = { successes: 0, failures: 0 };
}
function unconscious(encounter: EncounterState, targetId: string): void {
	const state = encounter.state(targetId);
	if (
		!state.conditions.some(
			(condition) => condition.name === "unconscious" && condition.sourceId === hpUnconsciousSource,
		)
	)
		state.conditions.push({ name: "unconscious", sourceId: hpUnconsciousSource });
	if (!state.conditions.some((condition) => condition.name === "prone")) state.conditions.push({ name: "prone" });
	state.hands = { left: null, right: null };
}
/** Normalize initial state without opening a turn or consuming randomness. */
export function initializeHitPoints(encounter: EncounterState, targetId: string): void {
	const state = encounter.state(targetId);
	if (state.hitPoints === 0) unconscious(encounter, targetId);
	if (state.conditions.some((condition) => condition.name === "unconscious")) {
		if (!state.conditions.some((condition) => condition.name === "prone")) state.conditions.push({ name: "prone" });
		state.hands = { left: null, right: null };
	}
	if (encounter.definition(targetId).hitPoints === 0 || exhaustionPenalty(state.conditions) <= -12)
		state.lifeState = "dead";
}
/** Apply R/I/V once per aggregated damage type, never per component or separate attack. */
export function resolveDefenses(encounter: EncounterState, targetId: string, byType: DamageByType): DamageByType {
	const defenses = encounter.definition(targetId).defenses;
	const result: DamageByType = {};
	for (const [type, amount] of Object.entries(byType)) {
		validAmount(amount);
		const damageType = type as keyof DamageByType;
		if (!damageTypeNames.includes(damageType)) throw new Error("Invalid damage type");
		let applied = amount;
		if (defenses.immunities.includes(damageType)) applied = 0;
		else {
			if (defenses.resistances.includes(damageType)) applied = Math.floor(applied / 2);
			if (defenses.vulnerabilities.includes(damageType)) applied *= 2;
		}
		result[damageType] = applied;
	}
	return result;
}
/** Basic Rules 2024 Damage and Healing; Temporary HP still means damage taken (Sage Advice). */
export function applyDamage(
	encounter: EncounterState,
	targetId: string,
	damage: number,
	options: { critical?: boolean } = {},
): HpChangeEvent {
	validAmount(damage);
	const state = encounter.state(targetId);
	const previousHp = state.hitPoints;
	const previousTemporaryHp = state.temporaryHp;
	const previousLifeState = state.lifeState;
	const previousDeathSaves = { ...state.deathSaves };
	if (encounter.hitPointMode(targetId) === "inexhaustible")
		return {
			targetId,
			previousHp,
			currentHp: previousHp,
			damageTaken: damage,
			hpLost: 0,
			reducedToZero: false,
			previousTemporaryHp,
			currentTemporaryHp: previousTemporaryHp,
			temporaryHpLost: 0,
			overflow: 0,
			previousLifeState,
			currentLifeState: previousLifeState,
			previousDeathSaves,
			currentDeathSaves: { ...previousDeathSaves },
		};
	const temporaryHpLost = Math.min(previousTemporaryHp, damage);
	const hpDamage = damage - temporaryHpLost;
	state.temporaryHp -= temporaryHpLost;
	state.hitPoints = Math.max(0, previousHp - hpDamage);
	const overflow = Math.max(0, hpDamage - previousHp);
	if (previousLifeState !== "dead" && damage > 0) {
		if (previousHp === 0) {
			state.lifeState = "dying";
			state.deathSaves.failures += options.critical ? 2 : 1;
			if (
				damage >= encounter.definition(targetId).hitPoints ||
				state.deathSaves.failures >= 3 ||
				encounter.zeroHpBehavior(targetId) === "die"
			)
				state.lifeState = "dead";
		} else if (state.hitPoints === 0) {
			state.lifeState =
				encounter.zeroHpBehavior(targetId) === "die" || overflow >= encounter.definition(targetId).hitPoints
					? "dead"
					: "dying";
			resetDeathSaves(encounter, targetId);
		}
		if (state.hitPoints === 0) unconscious(encounter, targetId);
	}
	return {
		targetId,
		previousHp,
		currentHp: state.hitPoints,
		damageTaken: damage,
		hpLost: previousHp - state.hitPoints,
		reducedToZero: previousHp > 0 && state.hitPoints === 0,
		previousTemporaryHp,
		currentTemporaryHp: state.temporaryHp,
		temporaryHpLost,
		overflow,
		previousLifeState,
		currentLifeState: state.lifeState,
		previousDeathSaves,
		currentDeathSaves: { ...state.deathSaves },
	};
}
export function heal(encounter: EncounterState, targetId: string, amount: number): HealingEvent {
	validAmount(amount);
	const state = encounter.state(targetId);
	const previousHp = state.hitPoints;
	const previousLifeState = state.lifeState;
	if (state.lifeState !== "dead")
		state.hitPoints = Math.min(encounter.definition(targetId).hitPoints, previousHp + amount);
	if (state.hitPoints > 0 && state.lifeState !== "dead") {
		state.lifeState = "alive";
		resetDeathSaves(encounter, targetId);
		state.conditions = state.conditions.filter(
			(condition) => condition.name !== "unconscious" || condition.sourceId !== hpUnconsciousSource,
		);
	}
	return {
		targetId,
		previousHp,
		currentHp: state.hitPoints,
		hpRegained: state.hitPoints - previousHp,
		previousLifeState,
		currentLifeState: state.lifeState,
	};
}
export function grantTemporaryHp(
	encounter: EncounterState,
	targetId: string,
	amount: number,
	replace: boolean,
): TemporaryHpEvent {
	validAmount(amount);
	if (encounter.hitPointMode(targetId) === "inexhaustible")
		throw new Error("Inexhaustible targets cannot receive Temporary HP");
	const state = encounter.state(targetId);
	const previousTemporaryHp = state.temporaryHp;
	if (replace) state.temporaryHp = amount;
	return { targetId, previousTemporaryHp, currentTemporaryHp: state.temporaryHp, replaced: replace };
}
export function resolveDeathSave(encounter: EncounterState, targetId: string, roller: DiceRoller): DeathSaveResult {
	const state = encounter.state(targetId);
	if (state.hitPoints !== 0 || state.lifeState !== "dying")
		throw new Error("Death save requires a dying creature at 0 HP");
	const previousLifeState = state.lifeState;
	const previousDeathSaves = { ...state.deathSaves };
	const { natural, d20Rolls } = rollD20Test(roller);
	const total = natural + exhaustionPenalty(state.conditions);
	const success = natural === 20 || (natural !== 1 && total >= 10);
	let hpRegained = 0;
	if (natural === 20) hpRegained = heal(encounter, targetId, 1).hpRegained;
	else {
		if (success) state.deathSaves.successes++;
		else state.deathSaves.failures += natural === 1 ? 2 : 1;
		if (state.deathSaves.failures >= 3) state.lifeState = "dead";
		else if (state.deathSaves.successes >= 3) {
			state.lifeState = "stable";
			resetDeathSaves(encounter, targetId);
		}
	}
	return {
		targetId,
		natural,
		d20Rolls,
		total,
		success,
		previousDeathSaves,
		currentDeathSaves: { ...state.deathSaves },
		previousLifeState,
		currentLifeState: state.lifeState,
		hpRegained,
	};
}
/** Engine validates and spends the Help Action, and validates the errata's 5-foot distance. */
export function stabilize(
	encounter: EncounterState,
	actorId: string,
	targetId: string,
	roller: DiceRoller,
): StabilizeResult {
	const actor = encounter.definition(actorId);
	const target = encounter.state(targetId);
	if (target.hitPoints !== 0 || target.lifeState !== "dying")
		throw new Error("Stabilization requires a dying creature at 0 HP");
	const conditions = encounter.state(actorId).conditions;
	const bonus =
		actor.getStatModifier("wisdom") +
		(actor.medicineProficient ? actor.getProficiencyBonus() : 0) +
		exhaustionPenalty(conditions);
	const { natural, d20Rolls } = rollD20Test(
		roller,
		false,
		conditions.some((condition) => condition.name === "poisoned"),
	);
	const total = natural + bonus;
	const success = total >= 10;
	const previousLifeState = target.lifeState;
	if (success) {
		target.lifeState = "stable";
		resetDeathSaves(encounter, targetId);
	}
	return {
		actorId,
		targetId,
		natural,
		d20Rolls,
		bonus,
		total,
		success,
		previousLifeState,
		currentLifeState: target.lifeState,
	};
}
