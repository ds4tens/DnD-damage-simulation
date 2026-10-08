import { abilityNames } from "../character/CombatantData.ts";
import type { DiceRoller } from "../dice/RandomSource.ts";
import { exhaustionPenalty, savingThrowConditionModifiers } from "../modifiers/Conditions.ts";
import type { EncounterState } from "./EncounterState.ts";
import type { SavingThrowRequest, SavingThrowResult } from "./SavingThrowTypes.ts";

/** Basic Rules 2024: Saving Throw, D20 Tests and Conditions; checked 2026-10-08. */
export function resolveSavingThrow(
	encounter: EncounterState,
	request: SavingThrowRequest,
	roller: DiceRoller,
	modifyMode?: (
		first: number,
		mode: { advantage: boolean; disadvantage: boolean },
	) => { advantage: boolean; disadvantage: boolean },
): SavingThrowResult {
	const definition = encounter.definition(request.targetId);
	const conditions = encounter.state(request.targetId).conditions;
	if (
		!abilityNames.includes(request.ability) ||
		!Number.isFinite(request.dc) ||
		request.dc < 0 ||
		!request.source ||
		(request.bonus !== undefined && !Number.isFinite(request.bonus))
	)
		throw new Error("Invalid saving throw request");
	const modifiers = savingThrowConditionModifiers(conditions, request.ability);
	const effectDisadvantage = encounter.effectsOn(request.targetId).some((effect) => effect.savingThrowDisadvantage);
	const bonus = definition.getSavingThrowBonus(request.ability) + (request.bonus ?? 0) + exhaustionPenalty(conditions);
	const base = { targetId: request.targetId, ability: request.ability, dc: request.dc, source: request.source, bonus };
	encounter.consumeSavingThrowEffects(request.targetId);
	if (request.voluntaryFailure || modifiers.automaticFailure)
		return {
			...base,
			d20Rolls: [],
			natural: null,
			total: null,
			success: false,
			outcome: request.voluntaryFailure ? "voluntary-failure" : "automatic-failure",
		};
	const rolls = rollD20Test(
		roller,
		request.advantage ?? false,
		(request.disadvantage ?? false) || modifiers.disadvantage || effectDisadvantage,
		modifyMode,
	);
	const total = rolls.natural + bonus;
	return {
		...base,
		d20Rolls: rolls.d20Rolls,
		natural: rolls.natural,
		total,
		success: total >= request.dc,
		outcome: "rolled",
	};
}

export function rollD20Test(
	roller: DiceRoller,
	advantage = false,
	disadvantage = false,
	modifyMode?: (
		first: number,
		mode: { advantage: boolean; disadvantage: boolean },
	) => { advantage: boolean; disadvantage: boolean },
) {
	const first = roller.roll(20);
	if (modifyMode) ({ advantage, disadvantage } = modifyMode(first, { advantage, disadvantage }));
	const d20Rolls = [first];
	if (advantage !== disadvantage) d20Rolls.push(roller.roll(20));
	return { d20Rolls, natural: advantage && !disadvantage ? Math.max(...d20Rolls) : Math.min(...d20Rolls) };
}
