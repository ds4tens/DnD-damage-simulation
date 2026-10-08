import assert from "node:assert/strict";
import test from "node:test";
import { EncounterState } from "../../../src/combat/state/EncounterState.ts";
import { FixedDiceRoller } from "../../../src/dice/RandomSource.ts";
import BaseMonster from "../../../src/monster/BaseMonster.ts";
import type { DprEpisode } from "../../../src/simulation/SimulationTypes.ts";
import {
	createEpisodeCleaveProvider,
	staticDistance,
	validateScenario,
} from "../../../src/simulation/scenario/Scenario.ts";

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

test("Cleave provider preserves adjacent targets beyond five feet so rules can apply actual reach", () => {
	const extended = {
		...episode,
		cleaveProbability: 1,
		targets: episode.targets.map((target) => ({ ...target, distanceToActor: 15 })),
	};
	const state = new EncounterState(
		extended.targets.map((target) => ({ id: target.id, definition: new BaseMonster(target.id, 15, 10) })),
	);
	assert.deepEqual(
		createEpisodeCleaveProvider(extended, state, new FixedDiceRoller([]))("hero", "first", 1).map(
			(candidate) => candidate.distanceToActor,
		),
		[15, 15],
	);
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

test("malformed attack policies reject instead of silently producing zero or a different attack", () => {
	const malformed = { ...episode, attack: { kind: "weapon" as const, mode: "melee" as const } };
	Reflect.set(malformed.attack, "mode", "spell");
	assert.throws(() => validateScenario({ id: "malformed", episodes: [malformed] }), /attack mode/);
	Reflect.set(malformed.attack, "kind", "spell");
	assert.throws(() => validateScenario({ id: "malformed", episodes: [malformed] }), /attack kind/);
	Reflect.set(malformed.attack, "kind", "unarmed");
	assert.throws(() => validateScenario({ id: "malformed", episodes: [malformed] }), /weapon mode/);
});

test("unsupported lighting and Cover reject globally, independently of selected build features", () => {
	const dark = { id: "unsupported-lighting", episodes: [episode] };
	Reflect.set(dark, "lighting", "darkness");
	assert.throws(() => validateScenario(dark), /bright lighting/);
	Reflect.set(dark, "lighting", "dim");
	assert.throws(() => validateScenario(dark), /bright lighting/);
	const covered = structuredClone({ id: "unsupported-cover", episodes: [episode] });
	const target = covered.episodes[0]?.targets[0];
	assert.ok(target);
	Reflect.set(target, "cover", "half");
	assert.throws(() => validateScenario(covered), /Cover/);
});

test("unknown and unsupported JSON condition names reject rather than silently removing their effects", () => {
	const first = episode.targets[0];
	assert.ok(first);
	const target = { ...first, conditions: [{ name: "prone" as const }] };
	const scenario = { id: "conditions", episodes: [{ ...episode, targets: [target], targetDistances: [] }] };
	validateScenario(scenario);
	for (const name of ["petrified", "charmed", "frightened", "banana", "__proto__"]) {
		Reflect.set(target.conditions[0] ?? {}, "name", name);
		assert.throws(() => validateScenario(scenario), /Unsupported target condition/);
	}
	Reflect.set(target, "conditions", [null]);
	assert.throws(() => validateScenario(scenario), /Invalid target condition/);
	Reflect.set(target, "conditions", {});
	assert.throws(() => validateScenario(scenario), /conditions must be an array/);
});
