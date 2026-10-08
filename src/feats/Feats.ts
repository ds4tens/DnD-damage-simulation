import type { CombatHook } from "../combat/CombatTypes.ts";
import { type FeatMetadata, type FeatName, featMetadata } from "./FeatTypes.ts";
import { greatWeaponMasterHook } from "./GreatWeaponMaster.ts";
import { piercerHook } from "./Piercer.ts";
import { savageAttackerHook } from "./SavageAttacker.ts";
import { slasherHook } from "./Slasher.ts";

export type FeatRule = FeatMetadata & { readonly combatHook?: CombatHook };
/** Canonical base-2024 registry. Extensions must be requested explicitly by engine callers. */
export const featRegistry: Readonly<Record<FeatName, FeatRule>> = Object.freeze({
	"ability-score-improvement": featMetadata["ability-score-improvement"],
	"savage-attacker": Object.freeze({
		...featMetadata["savage-attacker"],
		combatHook: Object.freeze(savageAttackerHook),
	}),
	piercer: Object.freeze({ ...featMetadata.piercer, combatHook: Object.freeze(piercerHook) }),
	slasher: Object.freeze({ ...featMetadata.slasher, combatHook: Object.freeze(slasherHook) }),
	"great-weapon-master": Object.freeze({
		...featMetadata["great-weapon-master"],
		combatHook: Object.freeze(greatWeaponMasterHook),
	}),
});
export const featCombatHooks: readonly CombatHook[] = Object.freeze(
	Object.values(featRegistry).flatMap((rule) => (rule.combatHook ? [rule.combatHook] : [])),
);
export { applyAbilityScoreImprovement, applyFeatAbilityScoreImprovement } from "./AbilityScoreImprovement.ts";
export { resolveFeatSelections } from "./FeatSelection.ts";
export type {
	AbilityScoreIncrease,
	FeatCategory,
	FeatMetadata,
	FeatName,
	FeatSelection,
	ValidatedFeatSelection,
} from "./FeatTypes.ts";
export { abilityScores, EFeatName, featMetadata, getFeatMetadata } from "./FeatTypes.ts";
export { greatWeaponMasterHook, piercerHook, savageAttackerHook, slasherHook };
