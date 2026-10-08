import type { CombatantInput, HandState } from "../combat/CombatTypes.ts";
import type { FeatChoices, FeatSelection } from "../feats/FeatTypes.ts";
import type { ArmorCatalogId } from "../Items/Armor.ts";
import type { WeaponCatalogId } from "../Items/Weapon/WeaponList.ts";
import type { AmmunitionKind } from "../Items/Weapon.ts";
import type BaseCharacter from "./BaseCharacter.ts";
import type { TStatBlock, TStatsType } from "./BaseCharacter.ts";
import type { BuildSupportReport } from "./FeatureSupport.ts";
import type { BackgroundId, SpeciesSelection } from "./Origins.ts";

export type BarbarianSubclassId = "berserker" | "wild-heart" | "world-tree" | "zealot";
export type ProgressionFeatChoice = { readonly level: 4 | 8 | 12 | 16 | 19; readonly feat: FeatSelection };
export type ConsumableStock = {
	readonly poisonDoses?: number;
	readonly ammunition?: Readonly<Partial<Record<AmmunitionKind, number>>>;
	readonly thrownWeapons?: Readonly<Partial<Record<WeaponCatalogId, number>>>;
};
export type CharacterBuildSelection = {
	readonly ruleset: "phb-2024";
	readonly className: "barbarian";
	readonly level: number;
	readonly subclass?: BarbarianSubclassId;
	readonly pointBuy: Readonly<TStatBlock>;
	readonly background: {
		readonly id: BackgroundId;
		readonly abilityScoreIncreases: readonly { readonly abilityScore: TStatsType; readonly amount: 1 | 2 }[];
		readonly featChoices?: FeatChoices;
		readonly toolChoice?: string;
	};
	readonly species: SpeciesSelection;
	readonly classSkills: readonly string[];
	readonly humanOriginFeat?: FeatSelection;
	readonly progression: readonly ProgressionFeatChoice[];
	readonly equipment: {
		readonly armorId: ArmorCatalogId;
		readonly shield: boolean;
		readonly weapons: readonly { readonly id: string; readonly weaponId: WeaponCatalogId }[];
		readonly hands: Readonly<HandState>;
	};
	readonly masteredWeaponIds: readonly WeaponCatalogId[];
	readonly stock?: ConsumableStock;
};
/** Runtime provenance is verified by assertLegalCharacterBuild, not by these public fields. */
export type LegalCharacterBuild = {
	readonly validation: "legal-phb-2024";
	readonly rulesVersion: string;
	readonly selection: CharacterBuildSelection;
	readonly character: BaseCharacter;
	readonly report: BuildSupportReport;
	readonly combatDefaults: Omit<CombatantInput, "id" | "definition">;
};
