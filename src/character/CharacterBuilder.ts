import type BaseClass from "../classes/BaseClass.ts";
import { featRegistry, type TFeatSelection } from "../feats/Feats.ts";
import type Weapon from "../Items/Weapon.ts";
import type { TStatBlock } from "./BaseCharacter.ts";
import BaseCharacter, { type TStatsType } from "./BaseCharacter.ts";

export function buildCharacter(selection: {
	level: number;
	characterClass: BaseClass;
	weapon: Weapon;
	weaponPrimaryStat: TStatsType;
	stats: TStatBlock;
	feats: TFeatSelection[];
}): BaseCharacter {
	let stats = selection.stats;
	selection.feats.forEach((feat) => {
		const featRule = featRegistry[feat.name as keyof typeof featRegistry];
		if (featRule?.apllyAbilityScoreImprovement) {
			stats = featRule.apllyAbilityScoreImprovement(feat, stats, feat.abilityScoreImprovement ?? []);
		}
	});

	return new BaseCharacter(
		selection.level,
		selection.characterClass,
		selection.weapon,
		selection.weaponPrimaryStat,
		stats,
		16,
		50,
		selection.feats,
	);
}
