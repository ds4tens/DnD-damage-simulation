import type { CharacterBuildSelection } from "./CharacterBuildTypes.ts";

/** Deterministic legal selections shared only by test fixtures. */
export function sampleSelection(level = 1): CharacterBuildSelection {
	return {
		ruleset: "phb-2024",
		className: "barbarian",
		level,
		...(level >= 3 ? { subclass: "berserker" as const } : {}),
		pointBuy: { strength: 15, dexterity: 14, constitution: 14, intelligence: 8, wisdom: 12, charisma: 8 },
		background: {
			id: "soldier",
			abilityScoreIncreases: [
				{ abilityScore: "strength", amount: 2 },
				{ abilityScore: "constitution", amount: 1 },
			],
			toolChoice: "dice-set",
		},
		species: { id: "dwarf" },
		classSkills: ["nature", "survival"],
		...(level >= 3 ? { primalKnowledgeSkill: "perception" } : {}),
		progression: [4, 8, 12, 16, 19]
			.filter((l) => l <= level)
			.map((l) => ({
				level: l as 4 | 8 | 12 | 16 | 19,
				feat: { name: "ability-score-improvement", abilityScoreImprovement: [{ abilityScore: "strength", amount: 2 }] },
			})),
		equipment: {
			armorId: "none",
			shield: false,
			weapons: [{ id: "staff", weaponId: "quarterstaff" }],
			hands: { left: "staff", right: null },
		},
		masteredWeaponIds: ["quarterstaff"],
	};
}
