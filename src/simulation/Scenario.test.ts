import assert from "node:assert/strict";
import test from "node:test";
import { EncounterState } from "../combat/EncounterState.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { createEpisodeCleaveProvider, staticDistance, validateScenario } from "./Scenario.ts";
import type { DprEpisode } from "./SimulationTypes.ts";

const episode: DprEpisode = {
	id: "first",
	targets: ["first", "second", "third"].map((id) => ({
		id,
		armorClass: 15,
		hitPoints: { mode: "finite", maximum: 10 },
		distanceToActor: 5,
	})),
	targetDistances: [
		{ firstId: "first", secondId: "second", feet: 5 },
		{ firstId: "first", secondId: "third", feet: 5 },
		{ firstId: "second", secondId: "third", feet: 5 },
	],
	cleaveProbability: 0.5,
};

test("static geometry is symmetric and missing pairs cannot authorize Cleave", () => {
	assert.equal(staticDistance(episode, "hero", "first"), 5);
	assert.equal(staticDistance(episode, "second", "first"), 5);
	assert.equal(staticDistance({ ...episode, targetDistances: [] }, "first", "second"), undefined);
});

test("multi-target Cleave samples once per global turn with fresh independent providers", () => {
	const state = new EncounterState(
		episode.targets.map((target) => ({ id: target.id, definition: new BaseMonster(target.id, 15, 10) })),
	);
	const environment = new FixedDiceRoller([1, 0x100000000]);
	const provider = createEpisodeCleaveProvider(episode, state, environment);
	assert.deepEqual(
		provider("hero", "first", 1).map((target) => target.targetId),
		["second", "third"],
	);
	assert.equal(provider("hero", "second", 1).length, 2);
	assert.equal(environment.remaining, 1);
	assert.deepEqual(provider("hero", "first", 2), []);
	assert.equal(environment.remaining, 0);
	assert.equal(createEpisodeCleaveProvider(episode, state, new FixedDiceRoller([1]))("hero", "first", 1).length, 2);
});

test("probability endpoints consume no environment roll; dead secondary targets are omitted", () => {
	const state = new EncounterState(
		episode.targets.map((target) => ({ id: target.id, definition: new BaseMonster(target.id, 15, 10) })),
	);
	const empty = new FixedDiceRoller([]);
	assert.equal(
		createEpisodeCleaveProvider({ ...episode, cleaveProbability: 1 }, state, empty)("hero", "first", 1).length,
		2,
	);
	assert.equal(
		createEpisodeCleaveProvider({ ...episode, cleaveProbability: 0 }, state, empty)("hero", "first", 1).length,
		0,
	);
	state.applyDamage("second", 10);
	assert.deepEqual(
		createEpisodeCleaveProvider({ ...episode, cleaveProbability: 1 }, state, empty)("hero", "first", 1).map(
			(target) => target.targetId,
		),
		["third"],
	);
});

test("day schedules require explicit >=10-minute gaps and coherent target and initiative IDs", () => {
	validateScenario({ id: "valid", episodes: [episode] });
	assert.throws(() => validateScenario({ id: "invalid", episodes: [episode, { ...episode, id: "second" }] }), /gap/);
	assert.throws(() =>
		validateScenario({
			id: "invalid",
			episodes: [episode, { ...episode, id: "second" }],
			transitions: [{ afterEpisodeId: "first", elapsedMinutes: 9 }],
		}),
	);
	validateScenario({
		id: "valid",
		episodes: [episode, { ...episode, id: "second" }],
		transitions: [{ afterEpisodeId: "first", elapsedMinutes: 10, rest: "short-rest" }],
	});
	assert.throws(() =>
		validateScenario({ id: "invalid", episodes: [{ ...episode, initiative: { order: ["hero", "first"] } }] }),
	);
	const firstTarget = episode.targets[0];
	assert.ok(firstTarget);
	assert.throws(() =>
		validateScenario({ id: "invalid", episodes: [{ ...episode, targets: [{ ...firstTarget, id: "hero" }] }] }),
	);
});
