import assert from "node:assert/strict";
import test from "node:test";
import BaseCharacter, { defaultStatBlock } from "../../../src/character/BaseCharacter.ts";
import BaseClass from "../../../src/classes/BaseClass.ts";
import type { AttackRequest } from "../../../src/combat/CombatTypes.ts";
import { CombatEngine } from "../../../src/combat/engine/AttackResolver.ts";
import { EncounterState } from "../../../src/combat/state/EncounterState.ts";
import Dice from "../../../src/dice/dice.ts";
import { FixedDiceRoller } from "../../../src/dice/RandomSource.ts";
import Weapon, { type WeaponCombatMetadata } from "../../../src/items/weapons/Weapon.ts";
import BaseMonster from "../../../src/monster/BaseMonster.ts";

function malformedWeapon(metadata: WeaponCombatMetadata) {
	return new Weapon("Custom", "", "simple", "common", 0, 0, "medium", [new Dice(6)], "slashing", undefined, metadata);
}
test("malformed weapon metadata rejects before costs, hands, effects and RNG, including owned instances", () => {
	for (const metadata of [
		{ category: "melee", flatDamage: NaN },
		{ category: "melee", reach: NaN },
		{ category: "ranged", range: { normal: 50, long: 10 } },
		{ category: "melee", versatileDamage: [2.5] },
		{ category: "melee", reach: 1.5 },
	] satisfies WeaponCombatMetadata[]) {
		const weapon = malformedWeapon(metadata);
		const actor = new BaseCharacter(1, new BaseClass([weapon]), weapon, "strength", defaultStatBlock, 10, 10);
		const encounter = new EncounterState([
			{ id: "actor", definition: actor },
			{ id: "target", definition: new BaseMonster("Target", 10, 10) },
		]);
		const roller = new FixedDiceRoller([10, 3]);
		const engine = new CombatEngine(encounter, { roller });
		engine.beginTurn("actor");
		encounter.addEffect({
			kind: "sap",
			sourceId: "target",
			targetId: "actor",
			expires: "start-of-source-next-turn",
			consumeOnAttack: { actorId: "actor" },
			attackDisadvantage: true,
		});
		const before = structuredClone(encounter.state("actor"));
		assert.throws(
			() =>
				engine.resolveSingleAttack({
					actorId: "actor",
					targetId: "target",
					actionSource: "attack-action",
					mode: weapon.category,
					weaponInstanceId: "actor:weapon",
				}),
			/Invalid|Illegal/i,
		);
		assert.deepEqual(encounter.state("actor"), before);
		assert.equal(encounter.turn.actionAvailable, true);
		assert.equal(encounter.turn.attackCounts.size, 0);
		assert.equal(encounter.effectsOn("actor").length, 1);
		assert.equal(encounter.state("target").hitPoints, 10);
		assert.equal(roller.remaining, 2);
	}
});
test("malformed profile fields reject before Action and RNG", () => {
	for (const override of [
		{ origin: "forged" },
		{ doublesOnCrit: "yes" },
		{ dice: null },
		{ flatBonus: null },
		{ source: null },
	]) {
		const encounter = new EncounterState([
			{ id: "actor", definition: new BaseMonster("Actor", 10, 10) },
			{ id: "target", definition: new BaseMonster("Target", 10, 10) },
		]);
		const roller = new FixedDiceRoller([10]);
		const engine = new CombatEngine(encounter, { roller });
		engine.beginTurn("actor");
		const request: AttackRequest = JSON.parse(
			JSON.stringify({
				actorId: "actor",
				targetId: "target",
				actionSource: "attack-action",
				mode: "melee",
				profile: {
					attackBonus: 0,
					damage: [
						{
							id: "bad",
							source: "validation",
							origin: "other",
							dice: [],
							damageType: "fire",
							flatBonus: 2,
							doublesOnCrit: false,
							...override,
						},
					],
				},
			}),
		);
		assert.throws(() => engine.resolveSingleAttack(request), /damage|Invalid/i);
		assert.equal(encounter.turn.actionAvailable, true);
		assert.equal(roller.remaining, 1);
	}
});
test("scenario sight removes Invisible benefits against the seeing creature; snapshots never expose mutable conditions", () => {
	const invisible = new BaseMonster("Invisible", 10, 10);
	invisible.conditions.push({ name: "invisible" });
	const encounter = new EncounterState([
		{ id: "a", definition: invisible },
		{ id: "b", definition: new BaseMonster("Seeing", 10, 10) },
	]);
	const roller = new FixedDiceRoller([10]);
	const engine = new CombatEngine(encounter, { roller, canSee: () => true });
	engine.beginTurn("a");
	const result = engine.resolveSingleAttack({
		actorId: "a",
		targetId: "b",
		actionSource: "attack-action",
		mode: "melee",
		profile: { attackBonus: 0, damage: [] },
	});
	assert.deepEqual(result.hit.d20Rolls, [10]);
	const snapshot = encounter.snapshot("a");
	assert.equal(Reflect.set(snapshot.conditions?.[0] ?? {}, "name", "poisoned"), false);
	assert.equal(encounter.state("a").conditions[0]?.name, "invisible");
});
