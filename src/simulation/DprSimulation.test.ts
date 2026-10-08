import assert from "node:assert/strict";
import test from "node:test";
import { buildLegalCharacter, type CharacterBuildSelection } from "../character/CharacterBuild.ts";
import { defaultStrategy } from "../combat/Strategy.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { aggregateDprTrials } from "./Aggregation.ts";
import { runDprBatch, runDprTrial } from "./DprSimulation.ts";
import type { DprEpisode, DprExperiment, DprScenario } from "./SimulationTypes.ts";

function selection(): CharacterBuildSelection {
	return {
		ruleset: "phb-2024",
		className: "barbarian",
		level: 1,
		pointBuy: { strength: 15, dexterity: 14, constitution: 13, intelligence: 8, wisdom: 12, charisma: 10 },
		background: {
			id: "soldier",
			abilityScoreIncreases: [
				{ abilityScore: "strength", amount: 1 },
				{ abilityScore: "constitution", amount: 2 },
			],
			toolChoice: "dice-set",
		},
		species: { id: "dwarf" },
		classSkills: ["perception", "survival"],
		progression: [],
		equipment: {
			armorId: "none",
			shield: false,
			weapons: [{ id: "mace-1", weaponId: "mace" }],
			hands: { left: "mace-1", right: null },
		},
		masteredWeaponIds: [],
	};
}
function episode(id = "first", rounds = 1): DprEpisode {
	return {
		id,
		rounds,
		targets: [{ id: "target", armorClass: 15, hitPoints: { mode: "inexhaustible" }, distanceToActor: 5 }],
		initiative: { order: ["hero", "target"] },
	};
}
function experiment(scenario: DprScenario = { id: "single", episodes: [episode()] }): DprExperiment {
	return {
		rootSeed: 2024,
		rulesetId: "phb-2024",
		codeVersion: "test-v1",
		buildId: "mace-barbarian",
		buildFactory: () => buildLegalCharacter(selection()),
		strategyId: "decline-optional",
		strategyParameters: null,
		strategyFactory: () => ({
			useFeature: () => false,
			useOptionalFeature: () => false,
			chooseFeatureAction: () => null,
		}),
		scenario,
	};
}
function fixed(combatRolls: readonly number[]) {
	return {
		combatRandomness: {
			algorithm: "fixed-sequence-test",
			parameters: { values: combatRolls },
			createRoller: () => new FixedDiceRoller(combatRolls),
		},
	};
}

test("finite targets exhaust naturally and remaining scheduled rounds contribute zero", () => {
	const first = episode("first", 3);
	const result = runDprTrial(
		experiment({
			id: "finite",
			episodes: [
				{
					...first,
					targets: [
						{
							id: "target",
							armorClass: 15,
							hitPoints: { mode: "finite", maximum: 1 },
							distanceToActor: 5,
						},
					],
				},
			],
		}),
		{ ...fixed([10, 6]), retainAttacks: true },
	);
	assert.equal(result.appliedDamage, 9);
	assert.equal(result.hitPointsLost, 1);
	assert.equal(result.overkill, 8);
	assert.equal(result.dpr, 3);
	assert.deepEqual(result.episodes[0]?.damageByRound, [9, 0, 0]);
	assert.equal(result.episodes[0]?.attacks?.length, 1);
});

test("inexhaustible targets preserve damage and ordinary criticals without HP loss or kills", () => {
	const result = runDprTrial(experiment({ id: "infinite", episodes: [episode("first", 2)] }), {
		...fixed([10, 6, 20, 1, 2]),
		retainAttacks: true,
	});
	assert.equal(result.appliedDamage, 15);
	assert.equal(result.hitPointsLost, 0);
	assert.equal(result.overkill, 0);
	assert.deepEqual(result.episodes[0]?.damageByRound, [9, 6]);
	assert.ok(result.episodes[0]?.attacks?.every((attack) => !attack.damage?.hp.reducedToZero));
	assert.equal(result.metadata.randomness.combatAlgorithm, "fixed-sequence-test");
});

test("exact complete d20/d6/critical-d6 enumeration independently yields DPR 3.75", () => {
	let total = 0;
	const input = experiment();
	for (let d20 = 1; d20 <= 20; d20++)
		for (let base = 1; base <= 6; base++)
			for (let critical = 1; critical <= 6; critical++)
				total += runDprTrial(input, fixed([d20, base, critical])).appliedDamage;
	assert.equal(total / (20 * 6 * 6), 3.75);
});

test("same trial is reproducible independently, after reordered trials and across chunks", () => {
	const input = experiment({ id: "seeded", episodes: [{ ...episode("first", 3), initiative: {} }] });
	const full = runDprBatch(input, { trials: 5, retainTrials: true });
	assert.ok(full.trials);
	const fifth = full.trials[4];
	assert.ok(fifth);
	assert.deepEqual(runDprTrial(input, { trialIndex: 4 }), fifth);
	runDprTrial(input, { trialIndex: 100 });
	assert.deepEqual(runDprTrial(input, { trialIndex: 4 }), fifth);
	const first = runDprBatch(input, { trials: 2, retainTrials: true });
	const last = runDprBatch(input, { trials: 3, startTrialIndex: 2, retainTrials: true });
	assert.ok(first.trials && last.trials);
	assert.deepEqual(aggregateDprTrials([...last.trials, ...first.trials], true), full);
	assert.ok(full.episodes[0]?.appliedDamage.confidenceInterval95);
});

test("stateful strategy instances are recreated for each independent whole-day trial", () => {
	const input = experiment({ id: "stateful", episodes: [episode("first", 2)] });
	const firstChoices: number[] = [];
	let factories = 0;
	input.strategyFactory = () => {
		factories++;
		let choices = 0;
		return {
			useFeature: () => false,
			useOptionalFeature: () => false,
			chooseFeatureAction: () => null,
			chooseNextAttack: (snapshot, candidates) => {
				if (candidates.length === 0) return null;
				if (choices === 0) firstChoices.push(choices);
				return choices++ === 0 ? defaultStrategy.chooseNextAttack(snapshot, candidates) : null;
			},
		};
	};
	runDprBatch(input, { trials: 4 });
	assert.equal(factories, 4);
	assert.deepEqual(firstChoices, [0, 0, 0, 0]);
	const reused = {};
	input.strategyFactory = () => reused;
	assert.throws(() => runDprBatch(input, { trials: 2 }), /reused/);
});

test("forged builds and unsupported requested benefits reject before strategy creation", () => {
	const input = experiment();
	let strategies = 0;
	input.strategyFactory = () => {
		strategies++;
		return {};
	};
	input.buildFactory = () => ({ ...buildLegalCharacter(selection()) });
	assert.throws(() => runDprBatch(input, { trials: 2 }), /legal|validated|provenance/i);
	assert.equal(strategies, 0);
	input.buildFactory = () => buildLegalCharacter(selection());
	input.requestedBenefits = ["dwarf.darkvision"];
	assert.throws(() => runDprBatch(input), /Unsupported/);
	assert.equal(strategies, 0);
});

test("every scheduled episode validates before starting any trial", () => {
	const bad = {
		...episode("late"),
		targets: [{ id: "target", armorClass: -1, hitPoints: { mode: "inexhaustible" as const }, distanceToActor: 5 }],
	};
	const input = experiment({
		id: "invalid-day",
		episodes: [episode(), bad],
		transitions: [{ afterEpisodeId: "first", elapsedMinutes: 10 }],
	});
	let builds = 0;
	input.buildFactory = () => {
		builds++;
		return buildLegalCharacter(selection());
	};
	assert.throws(() => runDprTrial(input), /AC/);
	assert.equal(builds, 0);
});

test("spent physical thrown instances carry across day episodes without replenishment", () => {
	const first = { ...episode(), attack: { kind: "weapon" as const, mode: "thrown" as const } };
	const second = { ...first, id: "second" };
	const input = experiment({
		id: "one-javelin-day",
		episodes: [first, second],
		transitions: [{ afterEpisodeId: "first", elapsedMinutes: 10, rest: "long-rest" }],
	});
	input.buildFactory = () =>
		buildLegalCharacter({
			...selection(),
			equipment: {
				armorId: "none",
				shield: false,
				weapons: [{ id: "javelin-1", weaponId: "javelin" }],
				hands: { left: "javelin-1", right: null },
			},
		});
	const result = runDprTrial(input, {
		combatRandomness: {
			algorithm: "per-episode-fixed-test",
			parameters: { first: [10, 6], second: [] },
			createRoller: (_seed, id) => new FixedDiceRoller(id === "first" ? [10, 6] : []),
		},
	});
	assert.deepEqual(
		result.episodes.map((entry) => entry.appliedDamage),
		[9, 0],
	);
	assert.equal(result.weaponInstancesSpent, 1);
	assert.deepEqual(result.episodes[0]?.finalSpentWeaponInstanceIds, ["javelin-1"]);
	assert.deepEqual(result.episodes[1]?.initialSpentWeaponInstanceIds, ["javelin-1"]);
	assert.equal(result.episodes[1]?.weaponInstancesSpent, 0);
	assert.equal(result.plannedRounds, 2);
	assert.equal(result.dpr, 4.5);
});
