export { aggregateDprTrials } from "./Aggregation.ts";
export { runDprBatch, runDprTrial } from "./DprSimulation.ts";
export { defaultCombatRounds, defaultTrials } from "./Scenario.ts";
export { combatRngAlgorithm, deriveSeed, seedDerivationVersion } from "./Seed.ts";
export type {
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
	DprTrialOptions,
	DprTrialResult,
} from "./SimulationTypes.ts";
export { type Estimate, estimate } from "./Statistics.ts";
