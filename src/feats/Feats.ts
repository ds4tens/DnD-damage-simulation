import type { TStatBlock, TStatsType } from "../character/BaseCharacter.ts";

import type { TDamageRollContext, TTurnContext } from "../combat/CombatTypes.ts";
import type { TCombatModifier } from "../modifiers/Modifiers.ts";

export enum EFeatName {
	/**
	 * You've trained to deal particularly damaging strikes.
	 * Once per turn when you hit a target with a weapon,
	 * you can roll the weapon's damage dice twice
	 * and use either roll against the target.
	 */
	SAVAGE_ATTACKER = "savage-attacker",
	/**
	 * Ability Score Increase. Increase your Strength or Dexterity by 1, to a maximum of 20.
	 * Enhanced Critical.
	 * When you score a Critical Hit that deals Slashing damage to a creature,
	 * it has Disadvantage on attack rolls until the start of your next turn.
	 */
	SLASHER = "slasher",
	/**
	 * Ability Score Increase. Increase your Strength or Dexterity by 1, to a maximum of 20.
	 * Puncture. Once per turn, when you hit a creature with an attack that deals Piercing damage,
	 * you can reroll one of the attack's damage dice, and you must use the new roll.
	 * Enhanced Critical. When you score a Critical Hit that deals Piercing damage to a creature,
	 * you can roll one additional damage die when determining the extra Piercing damage the target takes
	 */
	PIERCER = "piercer",
	/**
	 * Ability Score Increase. Increase your Strength score by 1, to a maximum of 20.
	 * Heavy Weapon Mastery. When you hit a creature with a weapon that has the Heavy property as part of the Attack action on your turn,
	 * you can cause the weapon to deal extra damage to the target. The extra damage equals your Proficiency Bonus.
	 * TODO: add HEW feature when bonus action is implemented
	 */
	GREAT_WEAPON_MASTERY = "great-weapon-master",
	/**
	 * Increase one ability score of your choice by 2, or increase two ability scores of your choice by 1.
	 * This feat can't increase an ability score above 20.
	 * Repeatable. You can take this feat more than once.
	 */
	ABLITY_SCORE_IMPROVEMENT = "ability-score-improvement",
}

export type TFeatName = `${EFeatName}`;

export type TFeatType = "origin" | "general";

export type TAbilityScoreImprovement = {
	abilityScore: TStatsType;
	amount: number;
}[];

export type TFeat = {
	name: TFeatName;
	type: TFeatType;
	abilityScoreImprovement?: TAbilityScoreImprovement;
	repeatable?: boolean;
};

export type TFeatSelection = {
	name: TFeatName;
	type: TFeatType;
	abilityScoreImprovement?: TAbilityScoreImprovement;
};

export type TFeatRule = {
	name: TFeatName;
	type: TFeatType;
	repeatable?: boolean;
	allowedAbilityScores?: TStatsType[];
	maxAbilityScoreIncrease?: number;
	getTurnModifiers?: (feat: TFeat, ctx: TTurnContext) => TCombatModifier;
	getDamageRollModifiers?: (feat: TFeat, ctx: TDamageRollContext) => TCombatModifier;
	apllyAbilityScoreImprovement?: (
		feat: TFeat,
		stats: TStatBlock,
		improvedStats: TAbilityScoreImprovement,
	) => TStatBlock;
};

export const featRegistry = {
	[EFeatName.ABLITY_SCORE_IMPROVEMENT]: {
		name: EFeatName.ABLITY_SCORE_IMPROVEMENT,
		type: "general",
		repeatable: true,
		allowedAbilityScores: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"],
		maxAbilityScoreIncrease: 2,
		apllyAbilityScoreImprovement: (_feat, stats, improvedStats) => {
			if (improvedStats.reduce((total, stat) => total + stat.amount, 0) > 2) {
				throw new Error("Ability score improvement cannot exceed 2 points");
			}
			const originalStats = { ...stats };
			improvedStats.forEach((stat) => {
				originalStats[stat.abilityScore] += stat.amount;
				if (originalStats[stat.abilityScore] > 20) {
					console.warn(`Ability score ${stat.abilityScore} cannot exceed 20, setting to 20`);
					originalStats[stat.abilityScore] = 20;
				}
			});
			return originalStats;
		},
	},
	[EFeatName.GREAT_WEAPON_MASTERY]: {
		name: EFeatName.GREAT_WEAPON_MASTERY,
		type: "general",
		// repeatable: false,
		allowedAbilityScores: ["strength"],
		maxAbilityScoreIncrease: 1,
		apllyAbilityScoreImprovement: (_feat, stats) => {
			let strength = stats.strength + 1;
			if (strength > 20) strength = 20;
			return {
				...stats,
				strength,
			};
		},
	},
	[EFeatName.PIERCER]: {
		name: EFeatName.PIERCER,
		type: "general",
		// repeatable: false,
		allowedAbilityScores: ["dexterity", "strength"],
		maxAbilityScoreIncrease: 1,
		apllyAbilityScoreImprovement: (_feat, stats, improvedStats) => {
			if (Array.isArray(improvedStats)) {
				if (improvedStats.length > 1 || improvedStats.reduce((total, stat) => total + stat.amount, 0) > 1) {
					console.warn("Piercer feat can only improve one ability score by 1");
					return stats;
				}
				const stat = improvedStats[0];
				if (!stat?.abilityScore) return stats;
				if (stat.abilityScore !== "dexterity" && stat.abilityScore !== "strength") {
					console.warn(
						`Piercer feat can only improve dexterity or strength ability scores, ${stat.abilityScore} is not allowed`,
					);
					return stats;
				}
				let originalStats = stats[stat.abilityScore] + 1;
				if (originalStats > 20) originalStats = 20;
				return {
					...stats,
					[stat.abilityScore]: originalStats,
				};
			}
			return stats;
		},
	},
} satisfies Partial<Record<TFeatName, TFeatRule>>;
