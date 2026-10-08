import assert from "node:assert/strict";
import test from "node:test";
import BaseCharacter, { defaultStatBlock } from "../../../src/character/BaseCharacter.ts";
import type { CombatantOptions } from "../../../src/character/CombatantData.ts";
import BaseClass from "../../../src/classes/BaseClass.ts";
import type { CombatHook } from "../../../src/combat/CombatTypes.ts";
import { CombatEngine } from "../../../src/combat/engine/AttackResolver.ts";
import { EncounterState } from "../../../src/combat/state/EncounterState.ts";
import { FixedDiceRoller } from "../../../src/dice/RandomSource.ts";
import type Weapon from "../../../src/items/weapons/Weapon.ts";
import { Dagger, Glaive, LightCrossbow } from "../../../src/items/weapons/WeaponList.ts";
import BaseMonster from "../../../src/monster/BaseMonster.ts";

function fixture(weapon: Weapon, rolls: number[], hooks: readonly CombatHook[] = [], options: CombatantOptions = {}) {
	const hero = new BaseCharacter(
		1,
		new BaseClass([weapon]),
		weapon,
		"strength",
		{ ...defaultStatBlock, strength: 16 },
		16,
		40,
		[],
		options,
	);
	const target = new BaseMonster("Target", 12, 100, 30, {
		defenses: { resistances: ["bludgeoning", "poison"], immunities: ["fire"] },
		savingThrowBonuses: { dexterity: 2 },
	});
	const encounter = new EncounterState([
		{ id: "hero", definition: hero },
		{ id: "target", definition: target, hitPointMode: "inexhaustible" },
	]);
	const roller = new FixedDiceRoller(rolls);
	const engine = new CombatEngine(encounter, { roller, hooks, distanceFor: () => 5 });
	return { encounter, roller, engine };
}

test("trusted feature attack profile keeps actual weapon identity and cannot be forged by caller", () => {
	const hook: CombatHook = {
		id: "test.pole",
		featureActions: () => [
			{
				id: "test.pole",
				cost: "bonus-action",
				attack: { targetId: "target", mode: "melee", weaponInstanceId: "hero:weapon", attackOrigin: "pole-strike" },
				attackDamage: { dice: [4], damageType: "bludgeoning" },
			},
		],
	};
	const f = fixture(Glaive, [12, 4], [hook]);
	f.engine.beginTurn("hero");
	const attack = f.engine.resolveFeatureActions("hero", "after-attack")[0]?.attacks[0];
	assert.equal(attack?.weapon?.name, Glaive.name);
	assert.equal(attack?.weaponInstanceId, "hero:weapon");
	assert.deepEqual(attack?.damage?.byType, { bludgeoning: 7 });
	assert.equal(attack?.damage?.appliedDamage, 3);
	assert.equal(f.encounter.canUseBonusAction("hero"), false);
	assert.throws(
		() =>
			f.engine.resolveSingleAttack({
				actorId: "hero",
				targetId: "target",
				actionSource: "bonus-action",
				mode: "melee",
				weapon: Glaive,
				attackOrigin: "pole-strike",
			}),
		/grant/,
	);
	assert.equal(f.roller.remaining, 0);
});

test("actor resistance exception preserves immunity and applies once per damage type", () => {
	const hook: CombatHook = {
		id: "test.potent",
		ignoreResistance: (_ctx, _target, type) => type === "poison",
		afterAttack: (ctx) => {
			ctx.dealDamage("target", [
				{
					id: "poison",
					source: "test.poison",
					origin: "feat",
					damageType: "poison",
					dice: [],
					flatBonus: 7,
					doublesOnCrit: false,
				},
				{
					id: "fire",
					source: "test.fire",
					origin: "feat",
					damageType: "fire",
					dice: [],
					flatBonus: 9,
					doublesOnCrit: false,
				},
			]);
			return [];
		},
	};
	const f = fixture(Dagger, [10, 2], [hook]);
	f.engine.beginTurn("hero");
	const attack = f.engine.resolveAttackAction("hero", "target").attacks[0];
	assert.deepEqual(attack?.additionalDamage?.[0]?.appliedByType, { poison: 7, fire: 0 });
	assert.equal(f.engine.damageEvents.length, 2);
});

test("physical d20s share one test identity while subsequent attacks have a new identity", () => {
	const seen: { id: string; dieIndex: number }[] = [];
	const hook: CombatHook = {
		id: "test.roll-identity",
		attackModifiers: () => [{ source: "test.advantage", attackRoll: { advantage: 1 } }],
		rollDie: (ctx, roll) => {
			if (roll.sides === 20 && ctx.rollTest) seen.push({ ...ctx.rollTest });
			return roll.value;
		},
	};
	const f = fixture(Dagger, [10, 12, 2, 10, 12, 2], [hook]);
	f.engine.beginTurn("hero");
	f.engine.resolveAttackAction("hero", "target");
	f.engine.endTurn();
	f.engine.beginTurn("hero");
	f.engine.resolveAttackAction("hero", "target");
	assert.equal(seen[0]?.id, seen[1]?.id);
	assert.deepEqual(
		seen.slice(0, 2).map((roll) => roll.dieIndex),
		[0, 1],
	);
	assert.notEqual(seen[0]?.id, seen[2]?.id);
});

test("trusted grapple selects target's better save, reserves a hand and blocks standing", () => {
	const hook: CombatHook = {
		id: "test.grapple",
		afterHitDamage: (ctx) => {
			ctx.resolveGrapple(ctx.request.targetId);
		},
	};
	const f = fixture(Dagger, [12, 2, 1], [hook]);
	f.engine.beginTurn("hero");
	const attack = f.engine.resolveAttackAction("hero", "target").attacks[0];
	assert.equal(attack?.savingThrows?.[0]?.ability, "dexterity");
	assert.equal(attack?.savingThrows?.[0]?.success, false);
	assert.equal(f.encounter.state("target").grappledBy, "hero");
	assert.equal(f.encounter.state("hero").hands.right, "$grapple:target");
	assert.equal(f.encounter.effectiveSpeed("target"), 0);
	f.encounter.state("target").conditions.push({ name: "prone" });
	f.engine.endTurn();
	f.engine.beginTurn("target");
	assert.equal(f.engine.standUp("target"), false);
});

test("explicit ammunition is spent on miss and neither rest nor a new attack replenishes it", () => {
	const f = fixture(LightCrossbow, [1, 1], [], {
		buildData: {
			species: { id: "dwarf" },
			size: "medium",
			armorTraining: [],
			skills: [],
			expertise: [],
			tools: [],
			featMasteredWeaponIds: [],
			stock: { ammunition: { bolt: 1 } },
		},
	});
	f.engine.beginTurn("hero");
	const attack = f.engine.resolveAttackAction("hero", "target", { mode: "ranged" }).attacks[0];
	assert.equal(attack?.hit.isHit, false);
	assert.equal(f.encounter.resourceRemaining("hero", "ammunition.bolt"), 0);
	assert.equal(f.encounter.resourceSpentSnapshot("hero")["ammunition.bolt"], 1);
	f.engine.endTurn();
	f.engine.recoverResources("hero", "long-rest");
	f.engine.beginTurn("hero");
	assert.deepEqual(f.engine.resolveAttackAction("hero", "target", { mode: "ranged" }), { totalDamage: 0, attacks: [] });
	assert.equal(f.encounter.canUseAction("hero"), true);
	assert.equal(f.roller.remaining, 0);
});

test("a grapple ends immediately when self damage incapacitates its owner, allowing the target to stand", () => {
	const hook: CombatHook = {
		id: "test.grapple-then-self-damage",
		afterHitDamage: (ctx) => {
			ctx.resolveGrapple(ctx.request.targetId);
			ctx.targetState.conditions.push({ name: "prone" });
			ctx.dealDamage(ctx.request.actorId, [
				{
					id: "self",
					source: "test.self",
					origin: "other",
					damageType: "radiant",
					dice: [],
					flatBonus: 40,
					doublesOnCrit: false,
				},
			]);
		},
	};
	const f = fixture(Dagger, [12, 2, 1], [hook]);
	f.engine.beginTurn("hero");
	f.engine.resolveAttackAction("hero", "target");
	assert.equal(f.encounter.state("hero").hitPoints, 0);
	assert.equal(f.encounter.state("target").grappledBy, undefined);
	assert.equal(
		f.encounter.state("target").conditions.some((c) => c.name === "grappled"),
		false,
	);
	assert.deepEqual(f.encounter.state("hero").hands, { left: null, right: null });
	f.engine.endTurn();
	f.engine.beginTurn("target");
	assert.equal(f.engine.standUp("target"), true);
	assert.equal(f.roller.remaining, 0);
});

for (const name of ["incapacitated", "paralyzed", "stunned", "unconscious"] as const)
	test(`an externally applied ${name} condition ends owned grapples at the next boundary`, () => {
		const hook: CombatHook = {
			id: "test.grapple",
			afterHitDamage: (ctx) => {
				ctx.resolveGrapple(ctx.request.targetId);
			},
		};
		const f = fixture(Dagger, [12, 2, 1], [hook]);
		f.engine.beginTurn("hero");
		f.engine.resolveAttackAction("hero", "target");
		f.engine.endTurn();
		f.encounter.state("hero").conditions.push({ name });
		f.engine.beginTurn("target");
		assert.equal(f.encounter.state("target").grappledBy, undefined);
		assert.equal(f.encounter.state("hero").hands.right, null);
		assert.equal(f.encounter.state("hero").hands.left, "hero:weapon");
		assert.equal(f.roller.remaining, 0);
	});
