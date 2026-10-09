export { aggregateDprTrials } from "./metrics/Aggregation.ts";
export { type Estimate, estimate } from "./metrics/Statistics.ts";
export { runDprBatch, runDprTrial } from "./runtime/DprSimulation.ts";
export { combatRngAlgorithm, deriveSeed, seedDerivationVersion } from "./runtime/Seed.ts";
export type {
	ActorHealth,
	DprAggregate,
	DprBatchOptions,
	DprBatchResult,
	DprEpisode,
	DprEpisodeResult,
	DprExperiment,
	DprMetadata,
	DprScenario,
	DprTarget,
	DprTransition,
	DprTransitionResult,
	DprTrialOptions,
	DprTrialResult,
	JsonValue,
	ResourceCost,
	ResourceCounts,
} from "./SimulationTypes.ts";
export { defaultCombatRounds, defaultTrials } from "./scenario/Scenario.ts";
