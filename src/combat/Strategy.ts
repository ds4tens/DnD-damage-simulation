import type {
	ActionSnapshot,
	AttackSelection,
	AttackSnapshot,
	FeatureActionChoice,
	FeatureSnapshot,
	TargetSnapshot,
} from "./CombatTypes.ts";
import type { DamagePool, RolledDamageDie } from "./DamageTypes.ts";

export interface CombatStrategy {
	useOptionalFeature(snapshot: Readonly<FeatureSnapshot>, featureId: string): boolean;
	chooseFeatureOption(
		snapshot: Readonly<FeatureSnapshot | AttackSnapshot>,
		featureId: string,
		candidates: readonly string[],
	): string | null;
	chooseFeatureAction(snapshot: Readonly<FeatureSnapshot>, candidates: readonly FeatureActionChoice[]): string | null;
	useFeature(snapshot: Readonly<AttackSnapshot>, featureId: string): boolean;
	chooseWeaponRoll(snapshot: Readonly<AttackSnapshot>, candidates: readonly DamagePool[]): number;
	choosePunctureDie(snapshot: Readonly<AttackSnapshot>, dice: readonly RolledDamageDie[]): string | null;
	applyPiercerCritical(snapshot: Readonly<AttackSnapshot>): boolean;
	choosePiercerCriticalDie(snapshot: Readonly<AttackSnapshot>, dice: readonly RolledDamageDie[]): string;
	chooseHewTarget(snapshot: Readonly<AttackSnapshot>, targets: readonly TargetSnapshot[]): string | null;
	chooseCleaveTarget(snapshot: Readonly<AttackSnapshot>, targets: readonly TargetSnapshot[]): string | null;
	chooseNextAttack(snapshot: Readonly<ActionSnapshot>, candidates: readonly AttackSelection[]): number | null;
	orderTriggers(snapshot: Readonly<AttackSnapshot>, ids: readonly string[]): readonly string[];
}
export function poolTotal(pool: DamagePool): number {
	return pool.reduce(
		(total, component) => total + component.flatBonus + component.dice.reduce((sum, die) => sum + die.value, 0),
		0,
	);
}
/** Stable tie breaking never consumes randomness or reveals future rolls. */
export const defaultStrategy: CombatStrategy = {
	useOptionalFeature: () => true,
	chooseFeatureOption: (_snapshot, _featureId, candidates) => candidates[0] ?? null,
	chooseFeatureAction: (_snapshot, candidates) => candidates[0]?.id ?? null,
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
	chooseCleaveTarget: (_snapshot, targets) => targets.find((target) => target.hitPoints > 0)?.id ?? null,
	chooseNextAttack: (snapshot, candidates) => {
		const choice = candidates.findIndex((candidate) =>
			snapshot.targets.some((target) => target.id === candidate.targetId && target.hitPoints > 0),
		);
		return choice < 0 ? null : choice;
	},
	orderTriggers: (_snapshot, ids) =>
		[...ids].sort((left, right) => Number(right === "weaponMastery.cleave") - Number(left === "weaponMastery.cleave")),
};

export function freezeSnapshot<T>(value: T): Readonly<T> {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) freezeSnapshot(child);
		Object.freeze(value);
	}
	return value;
}
