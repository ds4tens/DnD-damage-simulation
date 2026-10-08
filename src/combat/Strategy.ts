import type { AttackSnapshot, TargetSnapshot } from "./CombatTypes.ts";
import type { DamagePool, RolledDamageDie } from "./DamageTypes.ts";

export interface CombatStrategy {
	useFeature(snapshot: Readonly<AttackSnapshot>, featureId: string): boolean;
	chooseWeaponRoll(snapshot: Readonly<AttackSnapshot>, candidates: readonly DamagePool[]): number;
	choosePunctureDie(snapshot: Readonly<AttackSnapshot>, dice: readonly RolledDamageDie[]): string | null;
	applyPiercerCritical(snapshot: Readonly<AttackSnapshot>): boolean;
	choosePiercerCriticalDie(snapshot: Readonly<AttackSnapshot>, dice: readonly RolledDamageDie[]): string;
	chooseHewTarget(snapshot: Readonly<AttackSnapshot>, targets: readonly TargetSnapshot[]): string | null;
}
export function poolTotal(pool: DamagePool): number {
	return pool.reduce(
		(total, component) => total + component.flatBonus + component.dice.reduce((sum, die) => sum + die.value, 0),
		0,
	);
}
/** Stable tie breaking never consumes randomness or reveals future rolls. */
export const defaultStrategy: CombatStrategy = {
	useFeature: () => true,
	chooseWeaponRoll: (_snapshot, candidates) => {
		let bestIndex = 0;
		let bestTotal = -Infinity;
		candidates.forEach((candidate, index) => {
			const total = poolTotal(candidate);
			if (total > bestTotal) {
				bestTotal = total;
				bestIndex = index;
			}
		});
		return bestIndex;
	},
	choosePunctureDie: (_snapshot, dice) => {
		let bestId: string | null = null;
		let bestGain = 0;
		for (const die of dice) {
			const gain = (die.sides + 1) / 2 - die.value;
			if (gain > bestGain) {
				bestGain = gain;
				bestId = die.id;
			}
		}
		return bestId;
	},
	applyPiercerCritical: () => true,
	choosePiercerCriticalDie: (_snapshot, dice) => {
		let best = dice[0];
		if (!best) throw new Error("No critical die candidates");
		for (const die of dice) if (die.sides > best.sides) best = die;
		return best.id;
	},
	chooseHewTarget: (_snapshot, targets) => targets.find((target) => target.hitPoints > 0)?.id ?? null,
};

export function freezeSnapshot<T>(value: T): Readonly<T> {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) freezeSnapshot(child);
		Object.freeze(value);
	}
	return value;
}
