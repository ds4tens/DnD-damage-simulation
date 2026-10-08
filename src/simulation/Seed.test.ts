import assert from "node:assert/strict";
import test from "node:test";
import { deriveSeed, type SeedIdentity } from "./Seed.ts";

const identity: SeedIdentity = {
	rootSeed: 2024,
	rulesetId: "2024-base",
	codeVersion: "fixture-v1",
	buildId: "build-a",
	strategyId: "strategy-a",
	scenarioId: "scenario-a",
	trialIndex: 5,
};

test("seed identity distinguishes trial, stream and tuple fields with stable UTF-8 encoding", () => {
	const seed = deriveSeed(identity, "combat");
	assert.equal(deriveSeed({ ...identity }, "combat"), seed);
	assert.notEqual(deriveSeed(identity, "environment"), seed);
	assert.notEqual(deriveSeed({ ...identity, trialIndex: 6 }, "combat"), seed);
	assert.notEqual(
		deriveSeed({ ...identity, buildId: "a|b", strategyId: "c" }, "combat"),
		deriveSeed({ ...identity, buildId: "a", strategyId: "b|c" }, "combat"),
	);
	assert.equal(
		deriveSeed({ ...identity, buildId: "воин" }, "combat"),
		deriveSeed({ ...identity, buildId: "воин" }, "combat"),
	);
	assert.ok(seed >= 0 && seed <= 0xffffffff);
});

test("invalid seeds and identities reject before running trials", () => {
	for (const rootSeed of [-1, 0x100000000, 0.1, Number.NaN])
		assert.throws(() => deriveSeed({ ...identity, rootSeed }, "combat"));
	assert.throws(() => deriveSeed({ ...identity, trialIndex: -1 }, "combat"));
	assert.throws(() => deriveSeed({ ...identity, scenarioId: " " }, "combat"));
});
