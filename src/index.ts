import { createFiveFeatScenario } from "./scenarios/FiveFeats.ts";

const scenario = createFiveFeatScenario();
const result = scenario.run();
console.log(
	JSON.stringify(
		{
			scenario: "Synthetic Heavy Slashing 2d6 + Piercing d8; five base-2024 feats",
			ruleset: "D&D 2024 base; no supplements",
			randomness: "fixed deterministic sequence",
			strength: { before: scenario.baseStats.strength, after: scenario.character.stats.strength },
			feats: scenario.character.feats,
			attack: result,
			targets: [scenario.encounter.snapshot("first"), scenario.encounter.snapshot("second")],
			effects: scenario.encounter.effectsOn("first"),
			bonusActionAvailable: scenario.encounter.turn.bonusActionAvailable,
			remainingFixedRolls: scenario.roller.remaining,
		},
		null,
		2,
	),
);
scenario.encounter.endTurn();
