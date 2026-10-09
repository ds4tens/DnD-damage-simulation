import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDprTrials } from "./Aggregation.ts";
import type { DprMetadata, DprTrialResult } from "./SimulationTypes.ts";

const metadata: DprMetadata = {
	rulesetId: "phb-2024",
	rulesVersion: "fixture",
	codeVersion: "fixture",
	buildId: "a",
	build: null,
	buildSupport: null,
	strategyId: "a",
	strategyParameters: null,
	scenario: null,
	randomness: { rootSeed: 1, seedDerivation: "fixture", combatAlgorithm: "fixture", environmentAlgorithm: "fixture" },
	metric: "post-defense-damage-per-planned-combat-round",
	targetBehavior: "passive-stand-on-own-turn",
	actorHealthPolicy: "carry-across-episodes-long-rest-restores",
};
function trial(trialIndex: number, value: number): DprTrialResult {
	const episode = {
		id: "first",
		plannedRounds: 1,
		appliedDamage: value,
		hitPointsLost: 0,
		temporaryHitPointsLost: 0,
		overkill: 0,
		dpr: value,
		damageByRound: [value],
		initialResources: {},
		finalResources: {},
		initialActorHealth: { hitPoints: 20, temporaryHitPoints: 0 },
		finalActorHealth: { hitPoints: 20, temporaryHitPoints: 0 },
		resourceCost: trialIndex === 0 ? { rage: 1 } : {},
		weaponInstancesSpent: 0,
		initialSpentWeaponInstanceIds: [],
		finalSpentWeaponInstanceIds: [],
		initiative: [],
		seeds: { combat: 1, environment: 2 },
		limitations: [],
	};
	return {
		metadata,
		trialIndex,
		trialSeed: trialIndex + 10,
		plannedRounds: 2,
		appliedDamage: value * 2,
		hitPointsLost: 0,
		temporaryHitPointsLost: 0,
		overkill: 0,
		dpr: value,
		resourceCost: episode.resourceCost,
		weaponInstancesSpent: 0,
		episodes: [episode, { ...episode, id: "second" }],
		transitions: [],
	};
}

test("aggregation treats a complete day as one observation and absent resource spending as zero", () => {
	const batch = aggregateDprTrials([trial(0, 2), trial(1, 4), trial(2, 6)]);
	assert.equal(batch.aggregate.dpr.mean, 4);
	assert.equal(batch.aggregate.dpr.sampleCount, 3);
	assert.equal(batch.aggregate.dpr.sampleStandardDeviation, 2);
	assert.equal(batch.aggregate.appliedDamage.mean, 8);
	assert.equal(batch.episodes[0]?.dpr.sampleCount, 3);
	assert.ok(Math.abs((batch.aggregate.resourceCost.rage?.mean ?? 0) - 1 / 3) < 1e-15);
	assert.equal(batch.trials, undefined);
});

test("reordered chunk observations aggregate identically and retained data is detached", () => {
	const values = [trial(0, 2), trial(1, 4), trial(2, 6)];
	assert.deepEqual(aggregateDprTrials(values.toReversed()), aggregateDprTrials(values));
	const retained = aggregateDprTrials(values, true);
	assert.notEqual(retained.trials?.[0]?.metadata, metadata);
	assert.deepEqual(retained.trialSeeds, [
		{ trialIndex: 0, seed: 10 },
		{ trialIndex: 1, seed: 11 },
		{ trialIndex: 2, seed: 12 },
	]);
	assert.equal(aggregateDprTrials([trial(0, 3)]).aggregate.dpr.confidenceInterval95, null);
});

test("different experiments, duplicate trials and episode mismatches cannot be pooled", () => {
	assert.throws(() => aggregateDprTrials([]));
	assert.throws(() => aggregateDprTrials([trial(0, 2), trial(0, 4)]), /duplicate/);
	const changed = trial(1, 4);
	changed.metadata = { ...metadata, codeVersion: "other" };
	assert.throws(() => aggregateDprTrials([trial(0, 2), changed]), /different/);
	const changedEpisode = trial(1, 4);
	changedEpisode.episodes = changedEpisode.episodes.map((episode) => ({ ...episode, plannedRounds: 3 }));
	assert.throws(() => aggregateDprTrials([trial(0, 2), changedEpisode]), /different/);
});
