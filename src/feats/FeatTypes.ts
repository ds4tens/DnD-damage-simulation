import type { TStatsType } from "../character/BaseCharacter.ts";

export enum EFeatName {
	ABILITY_SCORE_IMPROVEMENT = "ability-score-improvement",
	SAVAGE_ATTACKER = "savage-attacker",
	PIERCER = "piercer",
	SLASHER = "slasher",
	GREAT_WEAPON_MASTER = "great-weapon-master",
}
export type FeatName = `${EFeatName}`;
export type FeatCategory = "origin" | "general";
export type AbilityScoreIncrease = { abilityScore: TStatsType; amount: number };
export type FeatSelection = {
	name: FeatName;
	type?: FeatCategory;
	abilityScoreImprovement?: readonly AbilityScoreIncrease[];
};
export type ValidatedFeatSelection = {
	name: FeatName;
	type: FeatCategory;
	abilityScoreImprovement?: readonly AbilityScoreIncrease[];
};
export type FeatMetadata = {
	readonly name: FeatName;
	readonly displayName: string;
	readonly type: FeatCategory;
	readonly repeatable: boolean;
	readonly minimumLevel: number;
	readonly minimumStrength?: number;
	readonly abilityScoreImprovement: {
		readonly pattern: "two-points" | "one-point" | "none";
		readonly allowedAbilityScores: readonly TStatsType[];
		readonly maximumScore: 20;
	};
};
export const abilityScores: readonly TStatsType[] = Object.freeze([
	"strength",
	"dexterity",
	"constitution",
	"intelligence",
	"wisdom",
	"charisma",
]);
const physicalChoices: readonly TStatsType[] = Object.freeze(["strength", "dexterity"]);
const strengthChoice: readonly TStatsType[] = Object.freeze(["strength"]);
const noChoices: readonly TStatsType[] = Object.freeze([]);
function metadata(
	name: FeatName,
	displayName: string,
	type: FeatCategory,
	repeatable: boolean,
	pattern: FeatMetadata["abilityScoreImprovement"]["pattern"],
	allowedAbilityScores: readonly TStatsType[],
	minimumStrength?: number,
): FeatMetadata {
	return Object.freeze({
		name,
		displayName,
		type,
		repeatable,
		minimumLevel: type === "general" ? 4 : 1,
		...(minimumStrength === undefined ? {} : { minimumStrength }),
		abilityScoreImprovement: Object.freeze({ pattern, allowedAbilityScores, maximumScore: 20 as const }),
	});
}
/** 2024 base rules; verified 2026-10-08. Canonical local selection requirements from P0 rules report.
 * Official Basic Rules: https://www.dndbeyond.com/sources/dnd/br-2024/feats
 * PHB 2024: Piercer p.206, Slasher p.208; no STR/DEX 13 prerequisite for either.
 * https://roll20.net/compendium/dnd5e/Feats%3APiercer?expansion=32231
 * https://roll20.net/compendium/dnd5e/Feats%3ASlasher?expansion=32231&iframe=true
 * GWM: official Bobby pregen, Feats section:
 * https://media.dndbeyond.com/compendium-images/uhlh/downloads/bobby-character-sheet.pdf
 */
export const featMetadata: Readonly<Record<FeatName, FeatMetadata>> = Object.freeze({
	"ability-score-improvement": metadata(
		"ability-score-improvement",
		"Ability Score Improvement",
		"general",
		true,
		"two-points",
		abilityScores,
	),
	"savage-attacker": metadata("savage-attacker", "Savage Attacker", "origin", false, "none", noChoices),
	piercer: metadata("piercer", "Piercer", "general", false, "one-point", physicalChoices),
	slasher: metadata("slasher", "Slasher", "general", false, "one-point", physicalChoices),
	"great-weapon-master": metadata(
		"great-weapon-master",
		"Great Weapon Master",
		"general",
		false,
		"one-point",
		strengthChoice,
		13,
	),
});
export function getFeatMetadata(name: FeatName): FeatMetadata {
	if (!Object.hasOwn(featMetadata, name)) throw new Error(`Unsupported feat selection: ${name}`);
	return featMetadata[name];
}
