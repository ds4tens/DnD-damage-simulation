import assert from "node:assert/strict";
import test from "node:test";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { createProbabilisticCleaveProvider, seededCleaveRandom } from "./Cleave.ts";

const candidate = { targetId: "second", distanceToActor: 10, distanceToPrimary: 5 };

test("Cleave probability endpoints need no environment draw", () => {
	for (const probability of [0, 1]) {
		const provider = createProbabilisticCleaveProvider({
			probability,
			candidate,
			random: () => {
				throw new Error("Unexpected random draw");
			},
		});
		assert.equal(provider.candidates("hero", "first", 1).length, probability);
		assert.deepEqual(provider.decisions, [
			{ actorId: "hero", turnId: 1, probability, sample: null, available: probability === 1 },
		]);
	}
});

test("Cleave caches actor/global turn opportunities across refusals and target changes", () => {
	const samples = [0.25, 0.75, 0.5];
	let calls = 0;
	const provider = createProbabilisticCleaveProvider({
		probability: 0.5,
		candidate,
		random: () => samples[calls++] ?? 0,
	});
	assert.deepEqual(provider.candidates("hero", "first", 1), [candidate]);
	assert.deepEqual(provider.candidates("hero", "third", 1), [candidate]);
	assert.deepEqual(provider.candidates("hero", "second", 1), []);
	assert.equal(calls, 1);
	assert.deepEqual(provider.candidates("hero", "first", 2), []);
	assert.deepEqual(provider.candidates("hero", "first", 2), []);
	assert.equal(calls, 2);
	assert.deepEqual(provider.candidates("ally", "first", 2), []);
	assert.equal(calls, 3, "a sample equal to p is unavailable; another actor samples independently");
});

test("Cleave snapshots are detached and independent seeds do not consume combat dice", () => {
	const input = { ...candidate };
	const first = createProbabilisticCleaveProvider({
		probability: 0.5,
		candidate: input,
		random: seededCleaveRandom(1),
	});
	const second = createProbabilisticCleaveProvider({ probability: 0.5, candidate, random: seededCleaveRandom(1) });
	const combat = new FixedDiceRoller([20, 4]);
	input.targetId = "changed";
	for (let turn = 1; turn <= 5; turn++)
		assert.deepEqual(first.candidates("hero", "first", turn), second.candidates("hero", "first", turn));
	assert.equal(combat.remaining, 2);
	assert.deepEqual(first.decisions, second.decisions);
	assert.ok(Object.isFrozen(first.decisions));
	assert.ok(Object.isFrozen(first.decisions[0]));
});

test("Cleave rejects invalid probabilities, geometry and environment values", () => {
	for (const probability of [-0.1, 1.1, NaN, Infinity])
		assert.throws(() => createProbabilisticCleaveProvider({ probability, candidate, random: () => 0 }));
	assert.throws(() =>
		createProbabilisticCleaveProvider({ probability: 1, candidate: { ...candidate, targetId: "" }, random: () => 0 }),
	);
	assert.throws(() =>
		createProbabilisticCleaveProvider({
			probability: 1,
			candidate: { ...candidate, distanceToPrimary: -1 },
			random: () => 0,
		}),
	);
	for (const value of [-0.1, 1, NaN, Infinity]) {
		const provider = createProbabilisticCleaveProvider({ probability: 0.5, candidate, random: () => value });
		assert.throws(() => provider.candidates("hero", "first", 1));
	}
});
