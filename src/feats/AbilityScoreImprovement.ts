import type { TStatBlock } from "../character/BaseCharacter.ts";
import { type AbilityScoreIncrease, type FeatName, getFeatMetadata } from "./FeatTypes.ts";

/** Validate the complete choice before applying any increase; never mutate the input. */
export function applyFeatAbilityScoreImprovement(
	name: FeatName,
	stats: TStatBlock,
	improvements: readonly AbilityScoreIncrease[] = [],
): TStatBlock {
	const rule = getFeatMetadata(name).abilityScoreImprovement;
	if (!Array.isArray(improvements as unknown)) throw new Error(`Invalid ability score choices for ${name}`);
	const seen = new Set<string>();
	for (const choice of improvements) {
		if (
			!choice ||
			!rule.allowedAbilityScores.includes(choice.abilityScore) ||
			!Number.isInteger(choice.amount) ||
			choice.amount < 1 ||
			choice.amount > 2 ||
			seen.has(choice.abilityScore)
		)
			throw new Error(`Invalid ability score choice for ${name}`);
		seen.add(choice.abilityScore);
	}
	const valid =
		rule.pattern === "none"
			? improvements.length === 0
			: rule.pattern === "one-point"
				? improvements.length === 1 && improvements[0]?.amount === 1
				: (improvements.length === 1 && improvements[0]?.amount === 2) ||
					(improvements.length === 2 && improvements.every((choice) => choice.amount === 1));
	if (!valid) throw new Error(`Invalid ability score choices for ${name}: expected ${rule.pattern}`);
	const result = { ...stats };
	for (const { abilityScore, amount } of improvements) {
		result[abilityScore] = Math.max(stats[abilityScore], Math.min(rule.maximumScore, stats[abilityScore] + amount));
	}
	return result;
}
export function applyAbilityScoreImprovement(
	stats: TStatBlock,
	improvements: readonly AbilityScoreIncrease[],
): TStatBlock {
	return applyFeatAbilityScoreImprovement("ability-score-improvement", stats, improvements);
}
