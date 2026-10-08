import assert from "node:assert/strict";
import test from "node:test";
import { CombatEngine } from "../../../src/combat/engine/AttackResolver.ts";
import { rollInitiative } from "../../../src/combat/engine/EncounterScheduler.ts";
import { EncounterState } from "../../../src/combat/state/EncounterState.ts";
import { FixedDiceRoller } from "../../../src/dice/RandomSource.ts";
import { runCombatSimulationDemo } from "../../../src/examples/CombatSimulation.ts";
import BaseMonster from "../../../src/monster/BaseMonster.ts";

// Basic Rules 2024 Playing the Game/Glossary: Initiative, Reaction, Invisible,
// Exhaustion, Death Saving Throws; PHB errata v2.0. Verified 2026-10-08.
function combat(rolls: readonly number[] = []) {
	const encounter = new EncounterState([
		{ id: "a", definition: new BaseMonster("Identical", 10, 10) },
		{ id: "b", definition: new BaseMonster("Identical", 10, 10) },
		{ id: "c", definition: new BaseMonster("Different", 10, 10) },
	]);
	const roller = new FixedDiceRoller(rolls);
	const engine = new CombatEngine(encounter, { roller, allowScenarioReactions: true });
	return { encounter, roller, engine };
}
test("Initiative: grouped monsters share a roll, ties follow explicit order and 1/20 have no automatic outcome", () => {
	const { encounter, roller } = combat([20, 20]);
	const result = rollInitiative(encounter, roller, { groups: [["a", "b"]], tieOrder: ["c", "b", "a"] });
	assert.deepEqual(result.order, ["c", "b", "a"]);
	assert.deepEqual(
		result.rolls.map((item) => item.total),
		[20, 20, 20],
	);
	assert.equal(roller.remaining, 0);
	const low = combat([1, 20, 10]);
	low.encounter.state("a").conditions.push({ name: "exhaustion", level: 2 });
	assert.equal(rollInitiative(low.encounter, low.roller).rolls.find((item) => item.actorId === "a")?.total, -3);
});
test("Initiative Invisible and Surprise cancel; invalid groups reject before RNG", () => {
	const f = combat([7, 10, 10]);
	f.encounter.state("a").conditions.push({ name: "invisible" });
	const result = rollInitiative(f.encounter, f.roller, { surprisedIds: ["a"] });
	assert.deepEqual(result.rolls.find((item) => item.actorId === "a")?.d20Rolls, [7]);
	assert.equal(f.roller.remaining, 0);
	const invalid = combat([10]);
	assert.throws(() => rollInitiative(invalid.encounter, invalid.roller, { groups: [["a", "c"]] }), /identical/);
	assert.equal(invalid.roller.remaining, 1);
});
test("scheduler keeps dead slots, rejects mixed lifecycle and refreshes Reaction only on owner start", () => {
	const f = combat([10]);
	const scheduler = f.engine.createScheduler({ order: ["a", "b", "c"] });
	assert.throws(() => f.engine.beginTurn("a"), /mix/);
	scheduler.beginNextTurn();
	const reaction = {
		actorId: "c",
		targetId: "a",
		mode: "melee" as const,
		actionSource: "reaction" as const,
		profile: { attackBonus: 0, damage: [] },
	};
	f.engine.resolveSingleAttack({ ...reaction, grant: f.engine.grantScenarioReaction(reaction) });
	assert.equal(f.encounter.canUseReaction("c"), false);
	scheduler.endTurn();
	scheduler.beginNextTurn();
	assert.equal(f.encounter.canUseReaction("c"), false);
	scheduler.endTurn();
	f.encounter.applyDamage("c", 10);
	const dead = scheduler.beginNextTurn();
	assert.equal(dead.ownerId, "c");
	assert.equal(dead.deathSave, undefined);
	assert.equal(f.encounter.state("c").reactionAvailable, true);
	assert.throws(() => f.engine.beginAttackAction("c"), /cannot take actions/);
	scheduler.endTurn();
	assert.equal(scheduler.roundNumber, 2);
	assert.equal(scheduler.beginNextTurn().ownerId, "a");
	assert.equal(f.encounter.turn.actionAvailable, true);
	assert.equal(f.encounter.roundNumber, 2);
	assert.throws(() => scheduler.beginNextTurn(), /End/);
	scheduler.endTurn();
	assert.throws(() => f.engine.createScheduler(), /mix/);
});
test("death save occurs once on explicit beginTurn; natural20 heals while Prone and dropped hands remain", () => {
	const encounter = new EncounterState([
		{ id: "dying", definition: new BaseMonster("Dying", 10, 10), initialHitPoints: 0, zeroHpBehavior: "death-saves" },
	]);
	const roller = new FixedDiceRoller([20]);
	const engine = new CombatEngine(encounter, { roller });
	assert.equal(encounter.state("dying").lifeState, "dying");
	const result = engine.beginTurn("dying");
	assert.equal(result.deathSave?.hpRegained, 1);
	assert.equal(encounter.state("dying").hitPoints, 1);
	assert.equal(encounter.state("dying").lifeState, "alive");
	assert.ok(encounter.state("dying").conditions.some((condition) => condition.name === "prone"));
	assert.equal(
		encounter.state("dying").conditions.some((condition) => condition.name === "unconscious"),
		false,
	);
	assert.deepEqual(encounter.state("dying").hands, { left: null, right: null });
	assert.throws(() => engine.beginTurn("dying"), /End/);
	assert.equal(roller.remaining, 0);
});
test("two-round scenario preserves Cleave budgets, resistance and TempHP: totals12/11, finalHP28/13/19", () => {
	const result = runCombatSimulationDemo();
	assert.deepEqual(
		result.rounds.map((round) => round.attackAction.totalDamage),
		[12, 11],
	);
	assert.deepEqual(
		result.rounds.map((round) => round.returnAttack.damage?.appliedByType),
		[{ fire: 3 }, { fire: 3 }],
	);
	assert.deepEqual(
		result.rounds[1]?.targets.map((target) => target.hitPoints),
		[28, 13, 19],
	);
	assert.deepEqual(
		result.rounds.map((round) => round.returnAttack.damage?.hp.temporaryHpLost),
		[3, 1],
	);
	assert.deepEqual(
		result.rounds.map((round) => round.attackAction.attacks[0]?.roundNumber),
		[1, 2],
	);
	assert.equal(result.cleaveDecisions.length, 2);
	assert.equal(result.remainingFixedRolls, 0);
});
