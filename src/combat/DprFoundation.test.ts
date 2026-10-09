import assert from "node:assert/strict";
import test from "node:test";
import BaseCharacter, { defaultStatBlock } from "../character/BaseCharacter.ts";
import BaseClass from "../classes/BaseClass.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { Dagger } from "../Items/Weapon/WeaponList.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { CombatEngine } from "./AttackResolver.ts";
import type { ResourceDefinition } from "./CombatResources.ts";
import type { CombatantInput, CombatHook } from "./CombatTypes.ts";
import { EncounterState } from "./EncounterState.ts";
import { applyDamage } from "./HitPointsResolver.ts";

class ResourceClass extends BaseClass {
	override getResourceDefinitions(): readonly ResourceDefinition[] {
		return [
			{ id: "test.rage", maxUses: 3, shortRest: "one", longRest: "all" },
			{ id: "test.daily", maxUses: 1, shortRest: "none", longRest: "all" },
		];
	}
}
function fixture(rolls: number[] = [], extra: Partial<CombatantInput> = {}, hooks: CombatHook[] = []) {
	const hero = new BaseCharacter(
		1,
		new ResourceClass([Dagger]),
		Dagger,
		"strength",
		{ ...defaultStatBlock, strength: 16 },
		16,
		30,
	);
	const encounter = new EncounterState([
		{ id: "hero", definition: hero, ...extra },
		{ id: "target", definition: new BaseMonster("Target", 12, 5), hitPointMode: "inexhaustible" },
	]);
	const roller = new FixedDiceRoller(rolls);
	const engine = new CombatEngine(encounter, { roller, hooks });
	return { hero, encounter, roller, engine };
}

test("inexhaustible targets preserve HP, states and actual damage without kills", () => {
	const f = fixture();
	const result = applyDamage(f.encounter, "target", 100, { critical: true });
	assert.equal(result.damageTaken, 100);
	assert.equal(result.hpLost, 0);
	assert.equal(result.reducedToZero, false);
	assert.equal(result.currentHp, 5);
	assert.equal(f.encounter.state("target").lifeState, "alive");
	assert.deepEqual(f.encounter.state("target").conditions, []);
	assert.throws(() => f.engine.grantTemporaryHp("target", 4, true), /Inexhaustible/);
	const invalid = new BaseMonster("Invalid", 10, 0);
	assert.throws(
		() => new EncounterState([{ id: "bad", definition: invalid, hitPointMode: "inexhaustible" }]),
		/positive HP/,
	);
});

test("resource recovery caps, cumulative expenditure and fresh encounter isolation", () => {
	const f = fixture([], { initialResources: { "test.rage": 1, "test.daily": 0 } });
	f.encounter.spendResource("hero", "test.rage");
	assert.deepEqual(f.encounter.resourceSpentSnapshot("hero"), { "test.rage": 1 });
	f.engine.recoverResources("hero", "short-rest");
	assert.equal(f.encounter.resourceRemaining("hero", "test.rage"), 1);
	assert.equal(f.encounter.resourceRemaining("hero", "test.daily"), 0);
	f.engine.recoverResources("hero", "long-rest");
	assert.deepEqual(f.encounter.resourceSnapshot("hero"), {
		"heroic-inspiration": 0,
		"test.rage": 3,
		"test.daily": 1,
	});
	assert.deepEqual(f.encounter.resourceSpentSnapshot("hero"), { "test.rage": 1 });
	const snapshot = f.engine.exportPersistentState("hero");
	assert.equal(Object.isFrozen(snapshot.resources), true);
	assert.throws(() => fixture([], { initialResources: { "test.rage": 4 } }), /Invalid initial uses/);
	assert.throws(() => fixture([], { initialResources: { unknown: 1 } }), /Unknown initial/);
	const second = fixture();
	assert.equal(second.encounter.resourceRemaining("hero", "test.rage"), 3);
	f.engine.beginTurn("hero");
	assert.throws(() => f.engine.recoverResources("hero", "long-rest"), /active turn/);
});

test("optional feature actions preserve frozen choices and authoritative Bonus Action cost", () => {
	const hook: CombatHook = {
		id: "test.activation",
		featureActions: (ctx) =>
			ctx.window === "before-attack"
				? [
						{
							id: "test.activate",
							cost: "bonus-action",
							execute: (ctx) => ctx.encounter.spendResource(ctx.actorId, "test.daily"),
						},
					]
				: [],
	};
	const f = fixture([], {}, [hook]);
	f.engine.beginTurn("hero");
	const results = f.engine.resolveFeatureActions("hero", "before-attack");
	assert.equal(results.length, 1);
	assert.equal(f.encounter.canUseBonusAction("hero"), false);
	assert.equal(f.encounter.resourceRemaining("hero", "test.daily"), 0);
	assert.deepEqual(f.engine.resolveFeatureActions("hero", "before-attack"), []);
	assert.equal(f.roller.remaining, 0);
	const no = fixture([], {}, [
		{ ...hook, featureActions: () => [{ id: "illegal", cost: "bonus-action", validate: () => false }] },
	]);
	no.engine.beginTurn("hero");
	assert.deepEqual(no.engine.resolveFeatureActions("hero", "before-attack"), []);
	assert.equal(no.encounter.canUseBonusAction("hero"), true);
});

test("d20 feature Advantage cancels existing Disadvantage without extra roll", () => {
	const hook: CombatHook = { id: "test.luck", d20Mode: (_ctx, _first, mode) => ({ ...mode, advantage: true }) };
	const f = fixture([10, 2], {}, [hook]);
	f.encounter.state("hero").conditions.push({ name: "poisoned" });
	f.engine.beginTurn("hero");
	const attack = f.engine.resolveAttackAction("hero", "target").attacks[0];
	assert.deepEqual(attack?.hit.d20Rolls, [10]);
	assert.equal(attack?.damage?.appliedDamage, 5);
	assert.equal(f.roller.remaining, 0);
});

test("immediate die reroll retains replacement without recursively rerolling", () => {
	const hook: CombatHook = {
		id: "test.reroll",
		rollDie: (ctx, roll) =>
			roll.kind === "attack" && roll.sides === 20 && roll.value === 1 ? ctx.roller.roll(20) : roll.value,
	};
	const f = fixture([1, 1], {}, [hook]);
	f.engine.beginTurn("hero");
	const attack = f.engine.resolveAttackAction("hero", "target").attacks[0];
	assert.equal(attack?.hit.d20Roll, 1);
	assert.equal(attack?.hit.isHit, false);
	assert.equal(f.roller.remaining, 0);
});

test("genuine Initiative events fire once; explicit order cannot fake resource recovery", () => {
	const hook: CombatHook = {
		id: "test.initiative",
		onInitiative: (ctx) => {
			ctx.encounter.state(ctx.actorId).classState["persistent.initiative"] =
				(Number(ctx.encounter.state(ctx.actorId).classState["persistent.initiative"]) || 0) + 1;
		},
	};
	const explicit = fixture([], {}, [hook]);
	const fake = explicit.engine.createScheduler({ order: ["hero", "target"] });
	assert.equal(explicit.encounter.state("hero").classState["persistent.initiative"], undefined);
	assert.throws(() => explicit.engine.processScheduledInitiative(fake), /repeated/);
	const actual = fixture([10, 8], {}, [hook]);
	actual.engine.createScheduler();
	assert.equal(actual.encounter.state("hero").classState["persistent.initiative"], 1);
	assert.equal(actual.roller.remaining, 0);
});

test("ordinary Unarmed candidates and zero stock do not consume invalid actions", () => {
	const f = fixture([12]);
	f.engine.beginTurn("hero");
	const attack = f.engine.resolveAttackAction("hero", "target", { unarmed: true }).attacks[0];
	assert.equal(attack?.weapon, undefined);
	assert.equal(attack?.damage?.appliedDamage, 4);
	assert.equal(f.roller.remaining, 0);
	const spent = fixture([], { initialSpentWeaponInstanceIds: ["hero:weapon"] });
	spent.engine.beginTurn("hero");
	assert.deepEqual(spent.engine.legalAttackCandidates("hero", "target"), []);
	assert.deepEqual(spent.engine.resolveAttackAction("hero", "target"), { totalDamage: 0, attacks: [] });
	assert.equal(spent.encounter.canUseAction("hero"), true);
});

test("separate damage and end-turn damage appear exactly once in actor ledger", () => {
	const hook: CombatHook = {
		id: "test.extra",
		afterAttack: (ctx, result) => {
			if (result.hit.isHit)
				ctx.dealDamage(ctx.request.targetId, [
					{
						id: "extra",
						source: "test.extra",
						origin: "feat",
						damageType: "fire",
						dice: [],
						flatBonus: 2,
						doublesOnCrit: false,
					},
				]);
			return [];
		},
		endTurn: (ctx) => {
			if (ctx.actorId === "hero")
				ctx.dealDamage("target", [
					{
						id: "aura",
						source: "test.aura",
						origin: "other",
						damageType: "radiant",
						dice: [],
						flatBonus: 1,
						doublesOnCrit: false,
					},
				]);
		},
	};
	const f = fixture([10, 2], {}, [hook]);
	f.engine.beginTurn("hero");
	const action = f.engine.resolveAttackAction("hero", "target");
	assert.equal(action.totalDamage, 7);
	assert.equal(action.attacks[0]?.additionalDamage?.[0]?.appliedDamage, 2);
	f.engine.endTurn();
	assert.deepEqual(
		f.engine.damageEvents.map((event) => event.result.appliedDamage),
		[5, 2, 1],
	);
	assert.equal(
		f.engine.damageEvents.reduce((sum, event) => sum + event.result.appliedDamage, 0),
		8,
	);
	assert.equal(Object.isFrozen(f.engine.damageEvents[0]?.result), true);
});
