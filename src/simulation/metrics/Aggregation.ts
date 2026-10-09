import { canonicalJson } from "../runtime/Serialization.ts";
import type { DprAggregate, DprBatchResult, DprEpisodeResult, DprTrialResult } from "../SimulationTypes.ts";
import { estimate } from "./Statistics.ts";

type Observation = Pick<
	DprTrialResult,
	"appliedDamage" | "hitPointsLost" | "overkill" | "dpr" | "resourceCost" | "weaponInstancesSpent"
>;
function summarize(values: readonly Observation[]): DprAggregate {
	const keys = [...new Set(values.flatMap((value) => Object.keys(value.resourceCost)))].sort();
	return {
		appliedDamage: estimate(values.map((value) => value.appliedDamage)),
		hitPointsLost: estimate(values.map((value) => value.hitPointsLost)),
		overkill: estimate(values.map((value) => value.overkill)),
		dpr: estimate(values.map((value) => value.dpr)),
		resourceCost: Object.fromEntries(
			keys.map((key) => [key, estimate(values.map((value) => value.resourceCost[key] ?? 0))]),
		),
		weaponInstancesSpent: estimate(values.map((value) => value.weaponInstancesSpent)),
	};
}

/** Sort observations by stable trial identity, allowing independently evaluated chunks to merge. */
export function aggregateDprTrials(trials: readonly DprTrialResult[], retainTrials = false): DprBatchResult {
	if (trials.length === 0) throw new Error("A DPR batch requires at least one trial");
	const ordered = [...trials].sort((left, right) => left.trialIndex - right.trialIndex);
	const first = ordered[0];
	if (!first) throw new Error("A DPR batch requires at least one trial");
	const metadata = canonicalJson(first.metadata);
	const seen = new Set<number>();
	for (const trial of ordered) {
		if (seen.has(trial.trialIndex)) throw new Error("A batch cannot contain duplicate trial indices");
		seen.add(trial.trialIndex);
		if (canonicalJson(trial.metadata) !== metadata || trial.plannedRounds !== first.plannedRounds)
			throw new Error("Cannot aggregate different DPR experiments");
		if (trial.episodes.length !== first.episodes.length)
			throw new Error("Cannot aggregate different episode schedules");
	}
	const episodes = first.episodes.map((episode, index) => {
		const observations: DprEpisodeResult[] = ordered.map((trial) => {
			const observation = trial.episodes[index];
			if (!observation || observation.id !== episode.id || observation.plannedRounds !== episode.plannedRounds)
				throw new Error("Cannot aggregate different episode schedules");
			return observation;
		});
		return { id: episode.id, ...summarize(observations) };
	});
	return {
		metadata: structuredClone(first.metadata),
		trialCount: ordered.length,
		startTrialIndex: first.trialIndex,
		trialSeeds: ordered.map((trial) => ({ trialIndex: trial.trialIndex, seed: trial.trialSeed })),
		aggregate: summarize(ordered),
		episodes,
		...(retainTrials ? { trials: structuredClone(ordered) } : {}),
	};
}
