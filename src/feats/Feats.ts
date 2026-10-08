import type { TStatBlock, TStatsType } from "../character/BaseCharacter.ts";
export enum EFeatName {
	SAVAGE_ATTACKER = "savage-attacker",
	SLASHER = "slasher",
	PIERCER = "piercer",
	GREAT_WEAPON_MASTERY = "great-weapon-master",
	ABLITY_SCORE_IMPROVEMENT = "ability-score-improvement",
}
export type TFeatName = `${EFeatName}`;
export type TFeatType = "origin" | "general";
export type TAbilityScoreImprovement = { abilityScore: TStatsType; amount: number }[];
export type TFeatSelection = { name: TFeatName; type: TFeatType; abilityScoreImprovement?: TAbilityScoreImprovement };
export type TFeat = TFeatSelection & { repeatable?: boolean };
export type TFeatRule = {
	name: TFeatName;
	type: TFeatType;
	repeatable?: boolean;
	allowedAbilityScores?: TStatsType[];
	maxAbilityScoreIncrease?: number;
	apllyAbilityScoreImprovement?: (
		feat: TFeatSelection,
		stats: TStatBlock,
		improvedStats: TAbilityScoreImprovement,
	) => TStatBlock;
};
/** Transitional selection metadata. Unsupported combat feats fail explicitly unless their hooks are registered. */
export const featRegistry: Partial<Record<TFeatName, TFeatRule>> = {
	[EFeatName.ABLITY_SCORE_IMPROVEMENT]: {
		name: EFeatName.ABLITY_SCORE_IMPROVEMENT,
		type: "general",
		repeatable: true,
		apllyAbilityScoreImprovement: (_feat, stats, improvements) => {
			const result = { ...stats };
			for (const selection of improvements)
				result[selection.abilityScore] = Math.max(
					result[selection.abilityScore],
					Math.min(20, result[selection.abilityScore] + selection.amount),
				);
			return result;
		},
	},
};
