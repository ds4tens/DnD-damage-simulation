import { speciesCombatHooks } from "../../character/origins/SpeciesFeatures.ts";
import type { CombatHook } from "../../combat/CombatTypes.ts";
import { bonusAttackFeatHooks } from "../features/BonusAttackFeatures.ts";
import { greatWeaponMasterHook } from "../features/GreatWeaponMaster.ts";
import { offensiveFeatHooks } from "../features/OffensiveFeatures.ts";
import { piercerHook } from "../features/Piercer.ts";
import { combatProwessHook, fateHook, globalRollHooks, luckyHook } from "../features/RollFeatures.ts";
import { savageAttackerHook } from "../features/SavageAttacker.ts";
import { slasherHook } from "../features/Slasher.ts";
import { type FeatMetadata, type FeatName, featMetadata } from "./FeatTypes.ts";

export type FeatRule = FeatMetadata & { readonly combatHook?: CombatHook };
/** Canonical base-2024 registry. Extensions must be requested explicitly by engine callers. */
const implementedHooks: Partial<Record<FeatName, CombatHook>> = {
	"savage-attacker": savageAttackerHook,
	piercer: piercerHook,
	slasher: slasherHook,
	"great-weapon-master": greatWeaponMasterHook,
	lucky: luckyHook,
	"boon-of-combat-prowess": combatProwessHook,
	"boon-of-fate": fateHook,
	...offensiveFeatHooks,
	...bonusAttackFeatHooks,
};
export const featRegistry: Readonly<Record<FeatName, FeatRule>> = Object.freeze(
	Object.fromEntries(
		Object.entries(featMetadata).map(([name, rule]) => {
			const hook = implementedHooks[name as FeatName];
			return [name, Object.freeze({ ...rule, ...(hook ? { combatHook: Object.freeze(hook) } : {}) })];
		}),
	) as Record<FeatName, FeatRule>,
);
export const featCombatHooks: readonly CombatHook[] = Object.freeze([
	...Object.values(featRegistry).flatMap((rule) => (rule.combatHook ? [rule.combatHook] : [])),
	...globalRollHooks,
	...speciesCombatHooks,
]);
export {
	applyAbilityScoreImprovement,
	applyFeatAbilityScoreImprovement,
} from "../selection/AbilityScoreImprovement.ts";
export { resolveFeatSelections } from "../selection/FeatSelection.ts";
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
