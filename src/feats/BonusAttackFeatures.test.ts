import assert from "node:assert/strict";
import test from "node:test";
import BaseCharacter, { defaultStatBlock } from "../character/BaseCharacter.ts";
import { buildLegalCharacter, combatantInputForBuild } from "../character/CharacterBuild.ts";
import { sampleSelection } from "../character/CharacterBuildTestFixtures.ts";
import BaseClass from "../classes/BaseClass.ts";
import { CombatEngine } from "../combat/AttackResolver.ts";
import { EncounterState } from "../combat/EncounterState.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { Dagger, Pike } from "../Items/Weapon/WeaponList.ts";
import type Weapon from "../Items/Weapon.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import type { FeatSelection } from "./FeatTypes.ts";

class TwoAttacks extends BaseClass {
	override getAttackCount() {
		return 2;
	}
	override getWeaponMasteryCount() {
		return 2;
	}
	override canUseWeaponMastery() {
		return true;
	}
}
function hero(weapon: Weapon, feat: FeatSelection, strength = 16) {
	return new BaseCharacter(
		5,
		new TwoAttacks([Pike, Dagger]),
		weapon,
		"strength",
		{ ...defaultStatBlock, strength, dexterity: 16 },
		16,
		100,
		[feat],
	);
}
const polearm: FeatSelection = {
	name: "polearm-master",
	abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }],
};
const dual: FeatSelection = {
	name: "dual-wielder",
	abilityScoreImprovement: [{ abilityScore: "dexterity", amount: 1 }],
};

test("Pole Strike accepts2024 Heavy+Reach Pike, uses d4 Bludgeoning and requires a completed Attack action", () => {
	const encounter = new EncounterState([
		{
			id: "hero",
			definition: hero(Pike, polearm),
			weapons: [{ id: "pike", weapon: Pike }],
			initialHands: { left: "pike", right: "pike" },
		},
		{ id: "target", definition: new BaseMonster("Target", 12, 1000), hitPointMode: "inexhaustible" },
	]);
	const roller = new FixedDiceRoller([12, 7, 12, 8, 12, 4]);
	const engine = new CombatEngine(encounter, { roller, distanceFor: () => 10 });
	engine.beginTurn("hero");
	const action = engine.beginAttackAction("hero");
	engine.attackInAction(action, { targetId: "target", weaponInstanceId: "pike", mode: "melee" });
	assert.deepEqual(engine.resolveFeatureActions("hero", "after-attack"), []);
	assert.equal(encounter.canUseBonusAction("hero"), true);
	engine.attackInAction(action, { targetId: "target", weaponInstanceId: "pike", mode: "melee" });
	engine.finishAttackAction(action);
	const result = engine.resolveFeatureActions("hero", "after-attack");
	assert.equal(result[0]?.attacks[0]?.attackOrigin, "pole-strike");
	assert.equal(result[0]?.attacks[0]?.weapon?.name, "Pike");
	assert.equal(result[0]?.attacks[0]?.damage?.components[0]?.damageType, "bludgeoning");
	assert.equal(result[0]?.attacks[0]?.damage?.appliedDamage, 7);
	assert.equal(
		engine.damageEvents.reduce((total, event) => total + event.result.appliedDamage, 0),
		28,
	);
	assert.equal(encounter.canUseBonusAction("hero"), false);
});

test("legal Pole Strike critical keeps Overwhelming Strike Bludgeoning against Piercing immunity", () => {
	const build = buildLegalCharacter({
		...sampleSelection(19),
		progression: [
			{ level: 4, feat: polearm },
			{
				level: 8,
				feat: { name: "ability-score-improvement", abilityScoreImprovement: [{ abilityScore: "strength", amount: 2 }] },
			},
			{
				level: 12,
				feat: {
					name: "ability-score-improvement",
					abilityScoreImprovement: [{ abilityScore: "constitution", amount: 2 }],
				},
			},
			{
				level: 16,
				feat: {
					name: "ability-score-improvement",
					abilityScoreImprovement: [{ abilityScore: "constitution", amount: 2 }],
				},
			},
			{
				level: 19,
				feat: {
					name: "boon-of-irresistible-offense",
					abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }],
				},
			},
		],
		equipment: {
			armorId: "none",
			shield: false,
			weapons: [{ id: "pike", weaponId: "pike" }],
			hands: { left: "pike", right: "pike" },
		},
		masteredWeaponIds: [],
	});
	const encounter = new EncounterState([
		combatantInputForBuild(build, "hero"),
		{
			id: "target",
			definition: new BaseMonster("Piercing immune", 15, 1000, 30, { defenses: { immunities: ["piercing"] } }),
			hitPointMode: "inexhaustible",
		},
	]);
	const roller = new FixedDiceRoller([1, 1, 20, 2, 3]);
	const engine = new CombatEngine(encounter, {
		roller,
		distanceFor: () => 10,
		strategy: {
			useOptionalFeature: (_snapshot, id) => id === "polearm-master.pole-strike",
			useFeature: (_snapshot, id) => id === "boon-of-irresistible-offense.overwhelming-strike",
		},
	});
	engine.beginTurn("hero");
	assert.equal(engine.resolveAttackAction("hero", "target").totalDamage, 0);
	const bonus = engine.resolveFeatureActions("hero", "after-attack")[0]?.attacks[0];
	assert.equal(bonus?.attackOrigin, "pole-strike");
	assert.equal(bonus?.hit.isCrit, true);
	assert.equal(bonus?.damage?.appliedDamage, 31); // 2d4(2+3) + STR5 + score21, score never doubled.
	assert.equal(bonus?.damage?.components.find((component) => component.origin === "feat")?.damageType, "bludgeoning");
	assert.equal(roller.remaining, 0);
});
for (const weaponId of ["pike", "glaive"] as const)
	test(`legal ${weaponId} Pole Strike uses actual d4 Bludgeoning for damage feats`, () => {
		const build = buildLegalCharacter({
			...sampleSelection(16),
			progression: [
				{ level: 4, feat: polearm },
				{
					level: 8,
					feat: { name: "piercer", abilityScoreImprovement: [{ abilityScore: "dexterity", amount: 1 }] },
				},
				{
					level: 12,
					feat: { name: "slasher", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
				},
				{
					level: 16,
					feat: { name: "crusher", abilityScoreImprovement: [{ abilityScore: "constitution", amount: 1 }] },
				},
			],
			equipment: {
				armorId: "none",
				shield: false,
				weapons: [{ id: "polearm", weaponId }],
				hands: { left: "polearm", right: "polearm" },
			},
			masteredWeaponIds: [],
		});
		const encounter = new EncounterState([
			combatantInputForBuild(build, "hero"),
			{ id: "target", definition: new BaseMonster("Target", 15, 1000), hitPointMode: "inexhaustible" },
		]);
		const roller = new FixedDiceRoller([1, 1, 20, 1, 2, 3, 4]);
		const engine = new CombatEngine(encounter, {
			roller,
			distanceFor: () => 10,
			strategy: {
				useOptionalFeature: (_snapshot, id) => id === "polearm-master.pole-strike",
				useFeature: (_snapshot, id) => id === "savage-attacker",
			},
		});
		engine.beginTurn("hero");
		assert.equal(engine.resolveAttackAction("hero", "target").totalDamage, 0);
		const bonus = engine.resolveFeatureActions("hero", "after-attack")[0]?.attacks[0];
		assert.equal(bonus?.damage?.appliedDamage, 11); // Savage selects d4(3+4) + STR4.
		assert.deepEqual(
			bonus?.damage?.components[0]?.dice.map((die) => die.sides),
			[4, 4],
		);
		assert.equal(
			bonus?.damage?.components.some((component) => component.source.startsWith("feat.piercer")),
			false,
		);
		assert.equal(
			encounter.effectsOn("hero").some((effect) => effect.kind === "crusher.enhanced-critical"),
			true,
		);
		assert.equal(
			encounter.effectsOn("target").some((effect) => effect.kind.startsWith("slasher.")),
			false,
		);
		assert.equal(encounter.effectiveSpeed("target"), 30);
		assert.equal(roller.remaining, 0);
	});
test("Dual Wielder earns a Bonus Action after Light misses and adds no positive ability modifier", () => {
	const encounter = new EncounterState([
		{
			id: "hero",
			definition: hero(Dagger, dual),
			weapons: [
				{ id: "a", weapon: Dagger },
				{ id: "b", weapon: Dagger },
			],
			initialHands: { left: "a", right: "b" },
		},
		{ id: "target", definition: new BaseMonster("Target", 12, 1000), hitPointMode: "inexhaustible" },
	]);
	const engine = new CombatEngine(encounter, {
		roller: new FixedDiceRoller([1, 1, 12, 4]),
		distanceFor: () => 5,
		strategy: {
			chooseNextAttack: (_s, c) =>
				c.findIndex((x) => x.attackOrigin === "primary") >= 0 ? c.findIndex((x) => x.attackOrigin === "primary") : null,
		},
	});
	engine.beginTurn("hero");
	engine.resolveAttackAction("hero", "target");
	const result = engine.resolveFeatureActions("hero", "after-attack");
	assert.equal(result[0]?.attacks[0]?.weaponInstanceId, "b");
	assert.equal(result[0]?.attacks[0]?.attackOrigin, "dual-wielder");
	assert.equal(result[0]?.attacks[0]?.damage?.appliedDamage, 4);
	assert.equal(encounter.canUseBonusAction("hero"), false);
});
test("Nick and Dual Wielder stack as separate extra attacks while using exactly one Bonus Action", () => {
	const encounter = new EncounterState([
		{
			id: "hero",
			definition: hero(Dagger, dual),
			weapons: [
				{ id: "a", weapon: Dagger },
				{ id: "b", weapon: Dagger },
			],
			initialHands: { left: "a", right: "b" },
			masteredWeaponIds: ["dagger"],
		},
		{ id: "target", definition: new BaseMonster("Target", 12, 1000), hitPointMode: "inexhaustible" },
	]);
	const roller = new FixedDiceRoller([12, 4, 12, 4, 12, 4, 12, 4]);
	const engine = new CombatEngine(encounter, {
		roller,
		distanceFor: () => 5,
		strategy: {
			chooseNextAttack: (_s, c) =>
				c.findIndex((x) => x.attackOrigin !== "light") >= 0 ? c.findIndex((x) => x.attackOrigin !== "light") : null,
		},
	});
	engine.beginTurn("hero");
	const action = engine.resolveAttackAction("hero", "target");
	assert.equal(action.attacks.length, 3);
	assert.equal(action.attacks.filter((attack) => attack.attackOrigin === "nick").length, 1);
	assert.equal(encounter.canUseBonusAction("hero"), true);
	const bonus = engine.resolveFeatureActions("hero", "after-attack");
	assert.equal(bonus[0]?.attacks.length, 1);
	assert.equal(engine.damageEvents.length, 4);
	assert.equal(roller.remaining, 0);
});

test("Dual Wielder retains a negative ability modifier on its Bonus Action attack", () => {
	const encounter = new EncounterState([
		{
			id: "hero",
			definition: hero(Dagger, dual, 8),
			weapons: [
				{ id: "a", weapon: Dagger },
				{ id: "b", weapon: Dagger },
			],
			initialHands: { left: "a", right: "b" },
		},
		{ id: "target", definition: new BaseMonster("Target", 12, 1000), hitPointMode: "inexhaustible" },
	]);
	const engine = new CombatEngine(encounter, {
		roller: new FixedDiceRoller([1, 1, 12, 4]),
		distanceFor: () => 5,
		strategy: {
			chooseNextAttack: (_s, c) =>
				c.findIndex((x) => x.attackOrigin === "primary") >= 0 ? c.findIndex((x) => x.attackOrigin === "primary") : null,
		},
	});
	engine.beginTurn("hero");
	engine.resolveAttackAction("hero", "target");
	const bonus = engine.resolveFeatureActions("hero", "after-attack");
	assert.equal(bonus[0]?.attacks[0]?.damage?.appliedDamage, 3);
});

test("Quick Draw prepares two physical weapons in one Attack action operation and leaves the BA weapon held", () => {
	const encounter = new EncounterState([
		{
			id: "hero",
			definition: hero(Dagger, dual),
			weapons: [
				{ id: "a", weapon: Dagger },
				{ id: "b", weapon: Dagger },
			],
			initialHands: { left: null, right: null },
		},
		{ id: "target", definition: new BaseMonster("Target", 12, 1000), hitPointMode: "inexhaustible" },
	]);
	const roller = new FixedDiceRoller([12, 4, 12, 4, 12, 4]);
	const engine = new CombatEngine(encounter, {
		roller,
		distanceFor: () => 5,
		strategy: {
			chooseNextAttack: (_s, c) =>
				c.findIndex((x) => x.attackOrigin === "primary") >= 0 ? c.findIndex((x) => x.attackOrigin === "primary") : null,
		},
	});
	engine.beginTurn("hero");
	engine.resolveAttackAction("hero", "target");
	assert.deepEqual(new Set(Object.values(encounter.state("hero").hands)), new Set(["a", "b"]));
	const bonus = engine.resolveFeatureActions("hero", "after-attack");
	assert.equal(bonus[0]?.attacks[0]?.attackOrigin, "dual-wielder");
	assert.equal(bonus[0]?.attacks[0]?.damage?.appliedDamage, 4);
	assert.equal(roller.remaining, 0);
});
