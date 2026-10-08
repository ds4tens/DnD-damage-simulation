import type { TStatBlock } from "../character/BaseCharacter.ts";
import { applyFeatAbilityScoreImprovement } from "./AbilityScoreImprovement.ts";
import {
	abilityScores,
	type FeatName,
	type FeatSelection,
	getFeatMetadata,
	type ValidatedFeatSelection,
} from "./FeatTypes.ts";

/** Local validation in selection order. This does not validate progression or feat slots. */
export function resolveFeatSelections(input: { level: number; stats: TStatBlock; feats: readonly FeatSelection[] }): {
	stats: TStatBlock;
	feats: ValidatedFeatSelection[];
} {
	if (!Number.isInteger(input.level) || input.level < 1 || input.level > 20) throw new Error("Invalid character level");
	for (const ability of abilityScores) {
		if (!Number.isInteger(input.stats[ability]) || input.stats[ability] < 1)
			throw new Error(`Invalid ability score: ${ability}`);
	}
	if (!Array.isArray(input.feats as unknown)) throw new Error("Invalid feat selections");
	let stats = { ...input.stats };
	const feats: ValidatedFeatSelection[] = [];
	const seen = new Set<FeatName>();
	for (const selection of input.feats) {
		if (!selection || typeof selection !== "object") throw new Error("Invalid feat selection");
		const rule = getFeatMetadata(selection.name);
		if (selection.type !== undefined && selection.type !== rule.type)
			throw new Error(`Invalid feat category for ${rule.name}`);
		if (input.level < rule.minimumLevel) throw new Error(`${rule.displayName} requires level ${rule.minimumLevel}`);
		if (rule.minimumStrength !== undefined && stats.strength < rule.minimumStrength)
			throw new Error(`${rule.displayName} requires Strength ${rule.minimumStrength} before its increase`);
		if (seen.has(rule.name) && !rule.repeatable) throw new Error(`Feat is not repeatable: ${rule.name}`);
		const improvements = selection.abilityScoreImprovement;
		stats = applyFeatAbilityScoreImprovement(rule.name, stats, improvements);
		feats.push({
			name: rule.name,
			type: rule.type,
			...(improvements === undefined
				? {}
				: {
						abilityScoreImprovement: improvements.map((choice) => ({
							abilityScore: choice.abilityScore,
							amount: choice.amount,
						})),
					}),
		});
		seen.add(rule.name);
	}
	return { stats, feats };
}
