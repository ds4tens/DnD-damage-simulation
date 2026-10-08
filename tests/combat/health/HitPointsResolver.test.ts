import assert from "node:assert/strict";
import test from "node:test";
import { defaultStatBlock } from "../../../src/character/BaseCharacter.ts";
import {
	applyDamage,
	grantTemporaryHp,
	heal,
	initializeHitPoints,
	resolveDeathSave,
	resolveDefenses,
	stabilize,
} from "../../../src/combat/health/HitPointsResolver.ts";
import { EncounterState } from "../../../src/combat/state/EncounterState.ts";
import { FixedDiceRoller } from "../../../src/dice/RandomSource.ts";
import BaseMonster from "../../../src/monster/BaseMonster.ts";

function fixture(hp = 6, maximum = 12, temporaryHp = 0) {
	const encounter = new EncounterState([
		{
			id: "target",
			definition: new BaseMonster("T", 10, maximum),
			initialHitPoints: hp,
			initialTemporaryHp: temporaryHp,
			zeroHpBehavior: "death-saves",
		},
		{ id: "helper", definition: new BaseMonster("H", 10, 20, 30, { stats: { ...defaultStatBlock, wisdom: 14 } }) },
	]);
	initializeHitPoints(encounter, "target");
	return encounter;
}
test("mixed defenses round aggregated types and apply R then V once", () => {
	const encounter = new EncounterState([
		{
			id: "target",
			definition: new BaseMonster("T", 10, 20, 30, {
				defenses: {
					resistances: ["slashing", "cold", "cold"],
					vulnerabilities: ["fire", "cold"],
					immunities: ["poison"],
				},
			}),
		},
	]);
	assert.deepEqual(resolveDefenses(encounter, "target", { slashing: 6, fire: 5, cold: 5, poison: 100, force: 1 }), {
		slashing: 3,
		fire: 10,
		cold: 4,
		poison: 0,
		force: 1,
	});
	assert.equal(resolveDefenses(encounter, "target", { slashing: 3 }).slashing, 1);
	assert.throws(() => resolveDefenses(encounter, "target", { fire: -1 }), /Amount/);
});
test("damage retains pre-temp damage, real HP loss and overflow separately", () => {
	const encounter = fixture(6, 12, 5);
	const result = applyDamage(encounter, "target", 7);
	assert.equal(result.damageTaken, 7);
	assert.equal(result.temporaryHpLost, 5);
	assert.equal(result.hpLost, 2);
	assert.equal(result.currentHp, 4);
	assert.equal(result.currentTemporaryHp, 0);
	assert.equal(result.overflow, 0);
});
test("massive damage exact boundary and monster default death policy", () => {
	assert.equal(applyDamage(fixture(), "target", 17).currentLifeState, "dying");
	assert.equal(applyDamage(fixture(), "target", 18).currentLifeState, "dead");
	assert.equal(applyDamage(fixture(6, 12, 5), "target", 18).currentLifeState, "dying");
	const monster = new EncounterState([{ id: "target", definition: new BaseMonster("T", 10, 6) }]);
	assert.equal(applyDamage(monster, "target", 6).currentLifeState, "dead");
});
test("zeroHP causes owned unconscious, Prone and drops held hands; healing preserves other source", () => {
	const encounter = fixture();
	encounter.state("target").hands = { left: "synthetic", right: null };
	encounter.state("target").conditions.push({ name: "unconscious", sourceId: "spell" });
	applyDamage(encounter, "target", 6);
	assert.deepEqual(encounter.state("target").hands, { left: null, right: null });
	assert.equal(encounter.state("target").conditions.filter((condition) => condition.name === "unconscious").length, 2);
	const event = heal(encounter, "target", 1);
	assert.equal(event.currentLifeState, "alive");
	assert.deepEqual(
		encounter.state("target").conditions.map((condition) => condition.name),
		["unconscious", "prone"],
	);
	assert.equal(encounter.state("target").conditions[0]?.sourceId, "spell");
});
test("tempHP never heals or stacks; healing caps and cannot resurrect", () => {
	const encounter = fixture(0, 12, 5);
	grantTemporaryHp(encounter, "target", 10, false);
	assert.equal(encounter.state("target").temporaryHp, 5);
	grantTemporaryHp(encounter, "target", 10, true);
	assert.equal(encounter.state("target").temporaryHp, 10);
	assert.equal(encounter.state("target").lifeState, "dying");
	assert.equal(heal(encounter, "target", 20).hpRegained, 12);
	assert.equal(encounter.state("target").temporaryHp, 10);
	applyDamage(encounter, "target", 40);
	assert.equal(heal(encounter, "target", 20).hpRegained, 0);
});
test("death save 9/10 and natural1/20 boundaries reset counters and retain Prone", () => {
	const encounter = fixture(0);
	assert.equal(resolveDeathSave(encounter, "target", new FixedDiceRoller([9])).currentDeathSaves.failures, 1);
	assert.equal(resolveDeathSave(encounter, "target", new FixedDiceRoller([10])).currentDeathSaves.successes, 1);
	assert.equal(resolveDeathSave(encounter, "target", new FixedDiceRoller([1])).currentLifeState, "dead");
	const revived = fixture(0);
	resolveDeathSave(revived, "target", new FixedDiceRoller([1]));
	const twenty = resolveDeathSave(revived, "target", new FixedDiceRoller([20]));
	assert.equal(twenty.hpRegained, 1);
	assert.deepEqual(twenty.currentDeathSaves, { successes: 0, failures: 0 });
	assert.equal(twenty.currentLifeState, "alive");
	assert.deepEqual(
		revived.state("target").conditions.map((condition) => condition.name),
		["prone"],
	);
});
test("three death successes stabilize; stable damage restarts dying and no repeated kill trigger", () => {
	const encounter = fixture(0);
	for (const roll of [10, 15, 19]) resolveDeathSave(encounter, "target", new FixedDiceRoller([roll]));
	assert.equal(encounter.state("target").lifeState, "stable");
	assert.deepEqual(encounter.state("target").deathSaves, { successes: 0, failures: 0 });
	assert.throws(() => resolveDeathSave(encounter, "target", new FixedDiceRoller([])), /dying/);
	const event = applyDamage(encounter, "target", 1);
	assert.equal(event.currentLifeState, "dying");
	assert.equal(event.currentDeathSaves.failures, 1);
	assert.equal(event.reducedToZero, false);
});
test("damage at zero counts even entirely absorbed by tempHP, crit two, max damage instantdeath", () => {
	const encounter = fixture(0, 12, 5);
	assert.equal(applyDamage(encounter, "target", 1).currentDeathSaves.failures, 1);
	assert.equal(applyDamage(encounter, "target", 0).currentDeathSaves.failures, 1);
	assert.equal(applyDamage(encounter, "target", 1, { critical: true }).currentLifeState, "dead");
	const massive = fixture(0, 12, 20);
	assert.equal(applyDamage(massive, "target", 12).currentLifeState, "dead");
	assert.equal(massive.state("target").temporaryHp, 8);
});
test("Medicine equality and poisoned/exhausted checks; resolver does not spend engine Action", () => {
	const encounter = fixture(0);
	assert.equal(stabilize(encounter, "helper", "target", new FixedDiceRoller([7])).success, false);
	assert.equal(stabilize(encounter, "helper", "target", new FixedDiceRoller([8])).total, 10);
	assert.equal(encounter.state("target").lifeState, "stable");
	const poisoned = fixture(0);
	poisoned.state("helper").conditions.push({ name: "poisoned" }, { name: "exhaustion", level: 1 });
	const result = stabilize(poisoned, "helper", "target", new FixedDiceRoller([19, 9]));
	assert.equal(result.total, 9);
	assert.equal(result.success, false);
});
test("exhaustion death save penalty never replaces natural20 benefit; states are independent", () => {
	const first = fixture(0);
	first.state("target").conditions.push({ name: "exhaustion", level: 2 });
	assert.equal(resolveDeathSave(first, "target", new FixedDiceRoller([13])).success, false);
	assert.equal(resolveDeathSave(first, "target", new FixedDiceRoller([20])).hpRegained, 1);
	assert.equal(fixture(0).state("target").deathSaves.failures, 0);
});

test("Medicine proficiency is added once and natural check1/20 are ordinary", () => {
	const encounter = new EncounterState([
		{ id: "target", definition: new BaseMonster("T", 10, 12), initialHitPoints: 0, zeroHpBehavior: "death-saves" },
		{
			id: "helper",
			definition: new BaseMonster("H", 10, 20, 30, {
				stats: { ...defaultStatBlock, wisdom: 14 },
				medicineProficient: true,
				proficiencyBonus: 3,
			}),
		},
	]);
	assert.equal(stabilize(encounter, "helper", "target", new FixedDiceRoller([4])).total, 9);
	assert.equal(stabilize(encounter, "helper", "target", new FixedDiceRoller([5])).total, 10);
	const strong = new EncounterState([
		{ id: "target", definition: new BaseMonster("T", 10, 12), initialHitPoints: 0, zeroHpBehavior: "death-saves" },
		{
			id: "helper",
			definition: new BaseMonster("H", 10, 20, 30, {
				stats: { ...defaultStatBlock, wisdom: 30 },
				medicineProficient: true,
			}),
		},
	]);
	assert.equal(stabilize(strong, "helper", "target", new FixedDiceRoller([1])).success, true);
});
test("invalid amounts and unknown damage types reject without state mutation", () => {
	const encounter = fixture();
	const snapshot = structuredClone(encounter.state("target"));
	for (const amount of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.throws(() => applyDamage(encounter, "target", amount), /Amount/);
		assert.throws(() => heal(encounter, "target", amount), /Amount/);
		assert.throws(() => grantTemporaryHp(encounter, "target", amount, true), /Amount/);
	}
	assert.throws(() => resolveDefenses(encounter, "target", JSON.parse('{"invalid": 1}')), /damage type/);
	assert.deepEqual(encounter.state("target"), snapshot);
});
