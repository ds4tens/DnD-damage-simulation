import { buildLegalCharacter } from "../character/CharacterBuild.ts";
import { runDprBatch } from "../simulation/DprSimulation.ts";

/** Small reproducible example; the public runner defaults to 10,000 independent trials. */
export function runDprSimulationDemo() {
	return runDprBatch(
		{
			rootSeed: 2024,
			rulesetId: "phb-2024",
			codeVersion: "barbarian-dpr-demo-v1",
			buildId: "human-berserker-9-greataxe",
			buildFactory: () =>
				buildLegalCharacter({
					ruleset: "phb-2024",
					className: "barbarian",
					level: 9,
					subclass: "berserker",
					pointBuy: { strength: 15, dexterity: 14, constitution: 13, intelligence: 8, wisdom: 12, charisma: 10 },
					background: {
						id: "soldier",
						abilityScoreIncreases: [
							{ abilityScore: "strength", amount: 1 },
							{ abilityScore: "constitution", amount: 2 },
						],
						toolChoice: "dice-set",
					},
					species: { id: "human", skill: "insight" },
					humanOriginFeat: { name: "lucky" },
					classSkills: ["perception", "survival"],
					primalKnowledgeSkill: "nature",
					progression: [
						{
							level: 4,
							feat: { name: "great-weapon-master", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
						},
						{ level: 8, feat: { name: "slasher", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] } },
					],
					equipment: {
						armorId: "none",
						shield: false,
						weapons: [{ id: "greataxe-1", weaponId: "greataxe" }],
						hands: { left: "greataxe-1", right: "greataxe-1" },
					},
					masteredWeaponIds: ["greataxe", "club", "mace"],
				}),
			strategyId: "first-legal-defaults",
			strategyParameters: { optionalFeatures: "accept", targetOrder: "first-live" },
			strategyFactory: () => ({}),
			scenario: {
				id: "finite-and-inexhaustible-static-cleave",
				initialRecovery: "long-rest",
				episodes: [
					{
						id: "three-rounds",
						targets: [
							{ id: "finite", armorClass: 15, hitPoints: { mode: "finite", maximum: 30 }, distanceToActor: 5 },
							{ id: "inexhaustible", armorClass: 15, hitPoints: { mode: "inexhaustible" }, distanceToActor: 5 },
						],
						targetDistances: [{ firstId: "finite", secondId: "inexhaustible", feet: 5 }],
						cleaveProbability: 1,
					},
				],
			},
		},
		{ trials: 32 },
	);
}
