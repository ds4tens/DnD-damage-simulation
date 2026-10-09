import type BaseClass from "../../classes/BaseClass.ts";
import type { FeatSelection } from "../../feats/catalog/FeatTypes.ts";
import type Weapon from "../../items/weapons/Weapon.ts";
import type { TStatBlock } from "../BaseCharacter.ts";
import BaseCharacter, { type TStatsType } from "../BaseCharacter.ts";
import type { CombatantOptions } from "../CombatantData.ts";

export function buildCharacter(selection: {
	level: number;
	characterClass: BaseClass;
	weapon: Weapon;
	weaponPrimaryStat: TStatsType;
	stats: TStatBlock;
	feats: readonly FeatSelection[];
	combatOptions?: CombatantOptions;
	armorClass?: number;
	hitPoints?: number;
}): BaseCharacter {
	return new BaseCharacter(
		selection.level,
		selection.characterClass,
		selection.weapon,
		selection.weaponPrimaryStat,
		selection.stats,
		selection.armorClass ?? 16,
		selection.hitPoints ?? 50,
		selection.feats,
		selection.combatOptions,
	);
}
