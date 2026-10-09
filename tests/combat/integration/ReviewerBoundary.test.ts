import assert from "node:assert/strict";
import test from "node:test";
import type { AttackRequest } from "../../../src/combat/CombatTypes.ts";
import { CombatEngine } from "../../../src/combat/engine/AttackResolver.ts";
import { EncounterState } from "../../../src/combat/state/EncounterState.ts";
import { FixedDiceRoller } from "../../../src/dice/RandomSource.ts";
import BaseMonster from "../../../src/monster/BaseMonster.ts";

test("review boundary: unknown profile damage type rejects atomically before attack costs and RNG", () => {
	const encounter = new EncounterState([
		{ id: "actor", definition: new BaseMonster("Actor", 10, 10) },
		{ id: "target", definition: new BaseMonster("Target", 10, 10) },
	]);
	const roller = new FixedDiceRoller([10, 10]);
	const engine = new CombatEngine(encounter, { roller });
	engine.beginTurn("actor");
	encounter.addEffect({
		kind: "sap",
		sourceId: "target",
		targetId: "actor",
		expires: "start-of-source-next-turn",
		attackDisadvantage: true,
		consumeOnAttack: { actorId: "actor" },
	});
	const beforeState = structuredClone(encounter.state("target"));
	const beforeEffects = structuredClone(encounter.effectsOn("actor"));
	const request: AttackRequest = JSON.parse(
		'{"actorId":"actor","targetId":"target","actionSource":"attack-action","mode":"melee","profile":{"attackBonus":0,"damage":[{"id":"invalid","source":"review","origin":"weapon","damageType":"banana","dice":[],"flatBonus":2,"doublesOnCrit":true}]}}',
	);
	assert.throws(() => engine.resolveSingleAttack(request), /damage|profile|Invalid/i);
	assert.equal(roller.remaining, 2);
	assert.equal(encounter.turn.actionAvailable, true);
	assert.equal(encounter.turn.attackCounts.size, 0);
	assert.deepEqual(encounter.effectsOn("actor"), beforeEffects);
	assert.deepEqual(encounter.state("target"), beforeState);
});
