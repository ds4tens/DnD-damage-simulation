import assert from "node:assert/strict";
import { test } from "node:test";
import BaseCharacter from "../../../src/character/BaseCharacter.ts";
import BaseClass from "../../../src/classes/BaseClass.ts";
import type { AttackRequest } from "../../../src/combat/CombatTypes.ts";
import { CombatEngine } from "../../../src/combat/engine/AttackResolver.ts";
import { EncounterState } from "../../../src/combat/state/EncounterState.ts";
import Dice from "../../../src/dice/dice.ts";
import { FixedDiceRoller } from "../../../src/dice/RandomSource.ts";
import Weapon from "../../../src/items/weapons/Weapon.ts";
import BaseMonster from "../../../src/monster/BaseMonster.ts";

class ExtraAttackClass extends BaseClass {
	override getAttackCount(_level: number): number {
		return 2;
	}
}
function fixture(extraAttack = false, optIn = true, rolls = [10, 2, 10, 2, 10, 2, 10, 2]) {
	const weapon = new Weapon("Budget weapon", "", "simple", "common", 1, 1, "medium", [new Dice(6)], "piercing");
	const actor = new BaseCharacter(
		4,
		extraAttack ? new ExtraAttackClass([weapon]) : new BaseClass([weapon]),
		weapon,
		"strength",
		undefined,
		12,
		30,
	);
	const encounter = new EncounterState([
		{ id: "actor", definition: actor },
		{ id: "target", definition: new BaseMonster("Target", 10, 100) },
	]);
	const roller = new FixedDiceRoller(rolls);
	const engine = new CombatEngine(encounter, { roller, allowScenarioReactions: optIn });
	engine.beginTurn("actor");
	const request: AttackRequest = {
		actorId: "actor",
		targetId: "target",
		actionSource: "attack-action",
		mode: "melee",
		distance: 5,
	};
	return { engine, encounter, roller, request };
}

test("one Action permits one Attack action; supplied actionId cannot grant a second", () => {
	const f = fixture();
	const result = f.engine.resolveSingleAttack({ ...f.request, actionId: "forged" });
	assert.notEqual(result.actionId, "forged");
	assert.equal(f.encounter.turn.actionAvailable, false);
	const before = f.roller.remaining;
	assert.throws(() => f.engine.resolveSingleAttack({ ...f.request, actionId: "forged" }), /Action unavailable/);
	assert.equal(f.roller.remaining, before);
});
test("Extra Attack shares one issued Action, has finite credits and rejects forged handles", () => {
	const f = fixture(true);
	const action = f.engine.beginAttackAction("actor");
	assert.equal(f.encounter.turn.actionAvailable, false);
	const selection = { targetId: "target", mode: "melee" as const, distance: 5 };
	const before = f.roller.remaining;
	assert.throws(() => f.engine.attackInAction({ ...action }, selection), /handle/);
	assert.equal(f.roller.remaining, before);
	const first = f.engine.attackInAction(action, selection);
	const second = f.engine.attackInAction(action, selection);
	assert.equal(first.actionId, second.actionId);
	assert.throws(() => f.engine.attackInAction(action, selection), /slot unavailable/);
	assert.equal(f.engine.finishAttackAction(action).attacks.length, 2);
	assert.throws(() => f.engine.attackInAction(action, selection), /handle/);
});
test("a handle cannot cross engines or global turns", () => {
	const first = fixture(true);
	const second = fixture(true);
	const action = first.engine.beginAttackAction("actor");
	const selection = { targetId: "target", mode: "melee" as const };
	assert.throws(() => second.engine.attackInAction(action, selection), /handle/);
	first.engine.endTurn();
	first.engine.beginTurn("actor");
	assert.throws(() => first.engine.attackInAction(action, selection), /handle/);
	assert.equal(first.encounter.turn.actionAvailable, true);
});
test("illegal initial and continued attacks fail before costs, effects or dice", () => {
	const f = fixture(true);
	f.encounter.addEffect({
		kind: "sap",
		sourceId: "target",
		targetId: "actor",
		expires: "start-of-source-next-turn",
		attackDisadvantage: true,
		consumeOnAttack: { actorId: "actor" },
	});
	const before = f.roller.remaining;
	assert.throws(() => f.engine.resolveSingleAttack({ ...f.request, distance: 6 }), /Illegal/);
	assert.equal(f.encounter.turn.actionAvailable, true);
	assert.equal(f.encounter.effectsOn("actor").length, 1);
	const action = f.engine.beginAttackAction("actor");
	assert.throws(() => f.engine.attackInAction(action, { targetId: "missing", mode: "melee" }), /Unknown/);
	assert.equal(f.roller.remaining, before);
	assert.equal(f.encounter.effectsOn("actor").length, 1);
});
test("a miss spends an Attack-action credit", () => {
	const f = fixture(false, true, [1]);
	assert.equal(f.engine.resolveSingleAttack(f.request).hit.isHit, false);
	assert.equal(f.encounter.turn.actionAvailable, false);
});
test("Reaction needs explicit scenario opt-in and an issued unforgeable trigger grant", () => {
	const f = fixture();
	const request = { ...f.request, actionSource: "reaction" as const };
	assert.throws(() => f.engine.resolveSingleAttack(request), /grant/);
	const grant = f.engine.grantScenarioReaction(request);
	assert.throws(() => f.engine.resolveSingleAttack({ ...request, grant: { ...grant } }), /grant/);
	assert.equal(f.encounter.canUseReaction("actor"), true);
	f.engine.resolveSingleAttack({ ...request, grant });
	assert.equal(f.encounter.canUseReaction("actor"), false);
	assert.throws(() => f.engine.resolveSingleAttack({ ...request, grant }), /grant/);
	const noOptIn = fixture(false, false);
	assert.throws(() => noOptIn.engine.grantScenarioReaction({ ...noOptIn.request, actionSource: "reaction" }), /opt-in/);
});
test("Reaction stays spent on other creatures' turns and refreshes only on its owner's start", () => {
	const f = fixture();
	const request = { ...f.request, actionSource: "reaction" as const };
	f.engine.resolveSingleAttack({ ...request, grant: f.engine.grantScenarioReaction(request) });
	f.engine.endTurn();
	f.engine.beginTurn("target");
	const grant = f.engine.grantScenarioReaction(request);
	const before = f.roller.remaining;
	assert.throws(() => f.engine.resolveSingleAttack({ ...request, grant }), /Reaction unavailable/);
	assert.equal(f.roller.remaining, before);
	f.engine.endTurn();
	f.engine.beginTurn("actor");
	assert.equal(f.encounter.canUseReaction("actor"), true);
});
test("incapacitated actors cannot start Actions or consume issued Reactions", () => {
	const f = fixture();
	const request = { ...f.request, actionSource: "reaction" as const };
	const grant = f.engine.grantScenarioReaction(request);
	f.encounter.state("actor").conditions.push({ name: "incapacitated" });
	const before = f.roller.remaining;
	assert.throws(() => f.engine.beginAttackAction("actor"), /cannot take actions/);
	assert.throws(() => f.engine.resolveSingleAttack({ ...request, grant }), /cannot take actions/);
	assert.equal(f.encounter.turn.actionAvailable, true);
	assert.equal(f.encounter.canUseReaction("actor"), true);
	assert.equal(f.roller.remaining, before);
});
test("unknown sources and forged Cleave origins cannot authorize free attacks", () => {
	const f = fixture();
	assert.throws(
		() => f.engine.resolveSingleAttack({ ...f.request, actionSource: "other" as AttackRequest["actionSource"] }),
		/grant/,
	);
	assert.throws(() => f.engine.resolveSingleAttack({ ...f.request, attackOrigin: "cleave" }), /grant/);
	assert.equal(f.encounter.turn.actionAvailable, true);
});
