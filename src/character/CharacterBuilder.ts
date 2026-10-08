import type BaseClass from "../classes/BaseClass.ts";
import type { FeatSelection } from "../feats/FeatTypes.ts";
import type Weapon from "../Items/Weapon.ts";
import type { TStatBlock } from "./BaseCharacter.ts";
import BaseCharacter, { type TStatsType } from "./BaseCharacter.ts";

export function buildCharacter(selection: {
	level: number;
	characterClass: BaseClass;
	weapon: Weapon;
	weaponPrimaryStat: TStatsType;
	stats: TStatBlock;
	feats: readonly FeatSelection[];
}): BaseCharacter {
	return new BaseCharacter(
		selection.level,
		selection.characterClass,
		selection.weapon,
		selection.weaponPrimaryStat,
		selection.stats,
		16,
		50,
		selection.feats,
	);
}
