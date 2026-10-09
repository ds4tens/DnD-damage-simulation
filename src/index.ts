import { runCombatSimulationDemo } from "./examples/CombatSimulation.ts";
import { runDprSimulationDemo } from "./examples/DprSimulation.ts";
import { createFiveFeatScenario } from "./examples/FiveFeats.ts";

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
scenario.engine.endTurn();
console.log(JSON.stringify(runCombatSimulationDemo(), null, 2));
console.log(JSON.stringify(runDprSimulationDemo(), null, 2));
