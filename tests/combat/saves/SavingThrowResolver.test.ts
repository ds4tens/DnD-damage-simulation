import assert from "node:assert/strict";
import test from "node:test";
import BaseCharacter, { defaultStatBlock } from "../../../src/character/BaseCharacter.ts";
import BaseClass from "../../../src/classes/BaseClass.ts";
import Barbarian from "../../../src/classes/barbarian/Barbarian.ts";
import { resolveSavingThrow } from "../../../src/combat/saves/SavingThrowResolver.ts";
import { EncounterState } from "../../../src/combat/state/EncounterState.ts";
import { FixedDiceRoller } from "../../../src/dice/RandomSource.ts";
import { Battleaxe } from "../../../src/items/weapons/WeaponList.ts";
import BaseMonster from "../../../src/monster/BaseMonster.ts";

const abilities = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
function request(ability: (typeof abilities)[number] = "constitution", dc = 15) {
	return { targetId: "target", ability, dc, source: "acceptance.save" };
}
function monster() {
	return new BaseMonster("Target", 10, 20, 30, {
		stats: Object.fromEntries(abilities.map((ability) => [ability, 14])) as typeof defaultStatBlock,
		proficiencyBonus: 3,
		savingThrowProficiencies: abilities,
	});
}
test("six saving throws combine ability/proficiency and equality succeeds", () => {
	for (const ability of abilities) {
		const encounter = new EncounterState([{ id: "target", definition: monster() }]);
		const result = resolveSavingThrow(encounter, { ...request(ability), bonus: 1 }, new FixedDiceRoller([9]));
		assert.equal(result.bonus, 6);
		assert.equal(result.total, 15);
		assert.equal(result.success, true);
		assert.equal(resolveSavingThrow(encounter, request(ability), new FixedDiceRoller([9])).success, false);
	}
});
test("ordinary natural1/20 are numerical, static overrides are full bonuses", () => {
	const encounter = new EncounterState([
		{
			id: "target",
			definition: new BaseMonster("T", 10, 20, 30, {
				stats: { ...defaultStatBlock, constitution: 18 },
				proficiencyBonus: 3,
				savingThrowProficiencies: ["constitution"],
				savingThrowBonuses: { constitution: 20 },
			}),
		},
	]);
	assert.equal(resolveSavingThrow(encounter, request("constitution", 21), new FixedDiceRoller([1])).success, true);
	const plain = new EncounterState([{ id: "target", definition: new BaseMonster("T", 10, 20) }]);
	assert.equal(resolveSavingThrow(plain, request("constitution", 21), new FixedDiceRoller([20])).success, false);
	assert.equal(resolveSavingThrow(plain, request("wisdom", 10), new FixedDiceRoller([10])).bonus, 0);
});
test("advantage/disadvantage cancellation and restrainedDEX use selected natural", () => {
	const encounter = new EncounterState([{ id: "target", definition: monster() }]);
	assert.equal(
		resolveSavingThrow(encounter, { ...request(), advantage: true }, new FixedDiceRoller([4, 16])).natural,
		16,
	);
	assert.equal(
		resolveSavingThrow(encounter, { ...request(), disadvantage: true }, new FixedDiceRoller([4, 16])).natural,
		4,
	);
	encounter.state("target").conditions.push({ name: "restrained" });
	assert.equal(
		resolveSavingThrow(encounter, { ...request("dexterity"), advantage: true }, new FixedDiceRoller([9])).natural,
		9,
	);
	assert.equal(resolveSavingThrow(encounter, request("dexterity"), new FixedDiceRoller([4, 16])).natural, 4);
});
test("forced and voluntary failures consume no dice but CON and mental saves still roll", () => {
	for (const name of ["paralyzed", "stunned", "unconscious"] as const) {
		const encounter = new EncounterState([{ id: "target", definition: monster() }]);
		encounter.state("target").conditions.push({ name });
		for (const ability of ["strength", "dexterity"] as const)
			assert.equal(
				resolveSavingThrow(encounter, request(ability), new FixedDiceRoller([])).outcome,
				"automatic-failure",
			);
		assert.equal(resolveSavingThrow(encounter, request("constitution"), new FixedDiceRoller([10])).outcome, "rolled");
	}
	const encounter = new EncounterState([{ id: "target", definition: monster() }]);
	assert.equal(
		resolveSavingThrow(encounter, { ...request(), voluntaryFailure: true }, new FixedDiceRoller([])).outcome,
		"voluntary-failure",
	);
});
test("exhaustion affects saves, poisoned does not; invalid request leaves dice intact", () => {
	const encounter = new EncounterState([{ id: "target", definition: monster() }]);
	encounter.state("target").conditions.push({ name: "exhaustion", level: 2 }, { name: "poisoned" });
	assert.equal(resolveSavingThrow(encounter, request(), new FixedDiceRoller([14])).total, 15);
	const roller = new FixedDiceRoller([10]);
	assert.throws(() => resolveSavingThrow(encounter, { ...request(), dc: Number.NaN }, roller), /Invalid/);
	assert.equal(roller.remaining, 1);
});
test("Barbarian save proficiency and mastery count are passive, distinct from weapon proficiency", () => {
	const character = new BaseCharacter(5, new Barbarian([Battleaxe]), Battleaxe, "strength", {
		...defaultStatBlock,
		strength: 16,
		constitution: 14,
	});
	assert.equal(character.getSavingThrowBonus("strength"), 6);
	assert.equal(character.getSavingThrowBonus("constitution"), 5);
	assert.equal(character.getSavingThrowBonus("wisdom"), 0);
	assert.equal(new BaseClass([]).getWeaponMasteryCount(20), 0);
	const barbarian = new Barbarian([]);
	assert.deepEqual(
		[1, 3, 4, 9, 10, 20].map((level) => barbarian.getWeaponMasteryCount(level)),
		[2, 2, 3, 3, 4, 4],
	);
	assert.equal(barbarian.canUseWeaponMastery(Battleaxe), true);
	assert.equal(barbarian.isProficientWithWeapon(Battleaxe), false);
});
