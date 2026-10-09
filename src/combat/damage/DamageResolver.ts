import type { DiceRoller } from "../../dice/RandomSource.ts";
import { validateSides } from "../../dice/RandomSource.ts";
import { resolveDefenses } from "../health/HitPointsResolver.ts";
import type { EncounterState } from "../state/EncounterState.ts";
import type {
	DamageByType,
	DamageComponent,
	DamagePool,
	DamageResult,
	DamageType,
	RolledDamageComponent,
	RolledDamageDie,
} from "./DamageTypes.ts";

export function rollDamageComponents(
	components: readonly DamageComponent[],
	isCrit: boolean,
	roller: DiceRoller,
): DamagePool {
	return components.map((component) => {
		const dice: RolledDamageDie[] = [];
		component.dice.forEach((sides, index) => {
			dice.push({
				id: `${component.id}:base:${index}`,
				componentId: component.id,
				sides,
				value: roller.roll(sides),
				provenance: "base",
			});
			if (isCrit && component.doublesOnCrit)
				dice.push({
					id: `${component.id}:crit:${index}`,
					componentId: component.id,
					sides,
					value: roller.roll(sides),
					provenance: "critical-copy",
				});
		});
		return { ...component, dice };
	});
}
export function validateDamagePool(pool: DamagePool): void {
	const componentIds = new Set<string>();
	const dieIds = new Set<string>();
	for (const component of pool) {
		if (componentIds.has(component.id) || !component.id)
			throw new Error(`Duplicate/empty damage component ID: ${component.id}`);
		componentIds.add(component.id);
		if (!Number.isFinite(component.flatBonus)) throw new Error("Invalid flat damage bonus");
		for (const die of component.dice) {
			validateSides(die.sides);
			if (dieIds.has(die.id) || !die.id || die.componentId !== component.id)
				throw new Error(`Invalid damage die ID: ${die.id}`);
			if (!Number.isSafeInteger(die.value) || die.value < 1 || die.value > die.sides)
				throw new Error("Invalid damage die value");
			dieIds.add(die.id);
		}
	}
}
export function allDamageDice(pool: DamagePool): readonly RolledDamageDie[] {
	return pool.flatMap((component) => component.dice);
}
export function rerollDamageDie(pool: DamagePool, dieId: string, roller: DiceRoller): DamagePool {
	const candidate = allDamageDice(pool).find((die) => die.id === dieId);
	if (!candidate) throw new Error(`Unknown damage die: ${dieId}`);
	const value = roller.roll(candidate.sides);
	return pool.map((component) => ({
		...component,
		dice: component.dice.map((die) => (die.id === dieId ? { ...die, value, rerolledFrom: die.value } : die)),
	}));
}
/** Additional dice are already the extra critical benefit and must never be doubled again. */
export function appendAdditionalDie(
	pool: DamagePool,
	component: Omit<DamageComponent, "dice" | "doublesOnCrit">,
	sides: number,
	roller: DiceRoller,
): DamagePool {
	const entry: RolledDamageComponent = {
		...component,
		doublesOnCrit: false,
		dice: [
			{
				id: `${component.id}:additional:0`,
				componentId: component.id,
				sides,
				value: roller.roll(sides),
				provenance: "additional",
			},
		],
	};
	return [...pool, entry];
}
export function sumDamageByType(pool: DamagePool): DamageByType {
	const totals: DamageByType = {};
	for (const component of pool)
		totals[component.damageType] =
			(totals[component.damageType] ?? 0) +
			component.flatBonus +
			component.dice.reduce((sum, die) => sum + die.value, 0);
	// Negative ability modifiers never heal a target.
	for (const type of Object.keys(totals) as (keyof DamageByType)[]) totals[type] = Math.max(0, totals[type] ?? 0);
	return totals;
}
export function resolveDamage(
	encounter: EncounterState,
	targetId: string,
	pool: DamagePool,
	options: { critical?: boolean; ignoredResistances?: readonly DamageType[] } = {},
): DamageResult {
	validateDamagePool(pool);
	const byType = sumDamageByType(pool);
	const rolledDamage = Object.values(byType).reduce((sum, value) => sum + (value ?? 0), 0);
	const appliedByType = resolveDefenses(encounter, targetId, byType, options.ignoredResistances);
	const appliedDamage = Object.values(appliedByType).reduce((sum, value) => sum + (value ?? 0), 0);
	return {
		components: pool,
		byType,
		appliedByType,
		rolledDamage,
		appliedDamage,
		hp: encounter.applyDamage(targetId, appliedDamage, options),
	};
}
