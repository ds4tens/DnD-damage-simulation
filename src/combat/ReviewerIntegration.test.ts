import assert from "node:assert/strict";
import test from "node:test";
import BaseCharacter from "../character/BaseCharacter.ts";
import BaseClass from "../classes/BaseClass.ts";
import Dice from "../dice/dice.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import Weapon from "../Items/Weapon.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { CombatEngine } from "./AttackResolver.ts";
import type { AttackRequest } from "./CombatTypes.ts";
import { EncounterState } from "./EncounterState.ts";

test("independent review: ordinary attack rejects a dead target without costs or RNG", () => {
	const encounter = new EncounterState([
		{ id: "actor", definition: new BaseMonster("Actor", 10, 10) },
		{ id: "dead", definition: new BaseMonster("Dead", 10, 10), initialHitPoints: 0 },
		{
			id: "dying",
			definition: new BaseMonster("Dying", 10, 10),
			initialHitPoints: 0,
			zeroHpBehavior: "death-saves",
		},
	]);
	const roller = new FixedDiceRoller([10, 10]);
	const engine = new CombatEngine(encounter, { roller });
	engine.beginTurn("actor");
	const request: AttackRequest = {
		actorId: "actor",
		targetId: "dead",
		actionSource: "attack-action",
		mode: "melee",
		distance: 5,
		profile: { attackBonus: 0, damage: [] },
	};
	assert.equal(engine.isAttackLegal({ ...request, targetId: "dying" }), true);
	assert.equal(engine.isAttackLegal(request), false);
	assert.throws(() => engine.resolveSingleAttack(request), /Illegal|dead/i);
	assert.equal(roller.remaining, 2);
	assert.equal(encounter.turn.actionAvailable, true);
	assert.equal(encounter.turn.attackCounts.size, 0);
});

test("independent review: valid named weapon cannot hide malformed owned-instance reach", () => {
	const makeWeapon = (reach: number) =>
		new Weapon("Sword", "", "simple", "common", 0, 0, "medium", [new Dice(6)], "slashing", undefined, {
			category: "melee",
			reach,
		});
	const valid = makeWeapon(5);
	const malformed = makeWeapon(Number.NaN);
	const actor = new BaseCharacter(1, new BaseClass([valid]), valid);
	const encounter = new EncounterState([
		{ id: "actor", definition: actor, weapons: [{ id: "owned", weapon: malformed }] },
		{ id: "target", definition: new BaseMonster("Target", 10, 10) },
	]);
	const roller = new FixedDiceRoller([10, 3]);
	const engine = new CombatEngine(encounter, { roller });
	engine.beginTurn("actor");
	const before = structuredClone(encounter.state("actor"));
	const request: AttackRequest = {
		actorId: "actor",
		targetId: "target",
		actionSource: "attack-action",
		mode: "melee",
		weapon: valid,
		weaponInstanceId: "owned",
		distance: 1000,
	};
	assert.equal(engine.isAttackLegal(request), false);
	assert.throws(() => engine.resolveSingleAttack(request), /Invalid|Illegal/i);
	assert.equal(roller.remaining, 2);
	assert.equal(encounter.turn.actionAvailable, true);
	assert.equal(encounter.turn.attackCounts.size, 0);
	assert.equal(encounter.state("target").hitPoints, 10);
	assert.deepEqual(encounter.state("actor"), before);
});

test("independent review: effect views detach nested expiry and consumption data from live state", () => {
	const encounter = new EncounterState([
		{ id: "actor", definition: new BaseMonster("Actor", 10, 10) },
		{ id: "target", definition: new BaseMonster("Target", 10, 10) },
	]);
	const engine = new CombatEngine(encounter, { roller: new FixedDiceRoller([]) });
	engine.beginTurn("actor");
	encounter.addEffect({
		kind: "review.duration",
		sourceId: "actor",
		targetId: "target",
		expires: { boundary: "end", combatantId: "actor", turnOccurrence: 2 },
		consumeOnAttack: { actorId: "target" },
		speedReduction: 10,
	});
	const view = encounter.effectsOn("target")[0];
	assert.ok(view && view.expires !== "start-of-source-next-turn");
	assert.ok(view.consumeOnAttack);
	Reflect.set(view.expires, "turnOccurrence", 0);
	Reflect.set(view.consumeOnAttack, "actorId", "actor");
	assert.deepEqual(encounter.effectsOn("target")[0]?.expires, {
		boundary: "end",
		combatantId: "actor",
		turnOccurrence: 2,
	});
	assert.deepEqual(encounter.effectsOn("target")[0]?.consumeOnAttack, { actorId: "target" });
	engine.endTurn();
	assert.equal(encounter.effectsOn("target").length, 1);
	engine.beginTurn("actor");
	engine.endTurn();
	assert.equal(encounter.effectsOn("target").length, 0);
});
