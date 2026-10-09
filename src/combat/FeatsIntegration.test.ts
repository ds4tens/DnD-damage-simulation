import assert from "node:assert/strict";
import { test } from "node:test";
import BaseCharacter from "../character/BaseCharacter.ts";
import { buildLegalCharacter, combatantInputForBuild } from "../character/CharacterBuild.ts";
import { buildCharacter } from "../character/CharacterBuilder.ts";
import { sampleSelection } from "../character/CharacterBuildTestFixtures.ts";
import BaseClass from "../classes/BaseClass.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { EFeatName, type FeatSelection, featRegistry } from "../feats/Feats.ts";
import { Greatsword, Longbow } from "../Items/Weapon/WeaponList.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { createFiveFeatScenario } from "../scenarios/FiveFeats.ts";
import { CombatEngine } from "./AttackResolver.ts";
import { allDamageDice } from "./DamageResolver.ts";
import { EncounterState } from "./EncounterState.ts";

const stats = { strength: 16, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
const asi: FeatSelection = {
	name: EFeatName.ABILITY_SCORE_IMPROVEMENT,
	abilityScoreImprovement: [{ abilityScore: "strength", amount: 2 }],
};

test("canonical registry exports the complete immutable PHB feat catalog and default hooks", () => {
	assert.equal(Object.keys(featRegistry).length, 75);
	assert.equal(featRegistry["ability-score-improvement"].combatHook, undefined);
	assert.equal(featRegistry["savage-attacker"].type, "origin");
	for (const [name, rule] of Object.entries(featRegistry)) {
		assert.equal(rule.name, name);
		assert.equal(Object.isFrozen(rule), true);
		if (rule.combatHook) assert.equal(rule.combatHook.featName, name);
	}
});

test("legal Weapon Master grants ranged mastery without requiring a combat hook", () => {
	const selection = sampleSelection(4);
	const build = buildLegalCharacter({
		...selection,
		progression: [
			{
				level: 4,
				feat: {
					name: "weapon-master",
					abilityScoreImprovement: [{ abilityScore: "dexterity", amount: 1 }],
					choices: { weaponMastery: "longbow" },
				},
			},
		],
		equipment: {
			...selection.equipment,
			weapons: [...selection.equipment.weapons, { id: "bow", weaponId: "longbow" }],
			hands: { left: "bow", right: "bow" },
		},
		stock: { ammunition: { arrow: 1 } },
	});
	assert.equal(featRegistry["weapon-master"].combatHook, undefined);
	const encounter = new EncounterState([
		combatantInputForBuild(build, "hero"),
		{ id: "target", definition: new BaseMonster("Target", 10, 100) },
	]);
	const engine = new CombatEngine(encounter, {
		roller: new FixedDiceRoller([10, 6]),
		strategy: { useFeature: (_snapshot, feature) => feature === "weaponMastery.slow" },
	});
	engine.beginTurn("hero");
	const attacks = engine.resolveAttackAction("hero", "target", { weapon: Longbow, mode: "ranged", distance: 10 });
	assert.equal(attacks.attacks[0]?.damage?.appliedDamage, 8);
	assert.equal(encounter.effectiveSpeed("target"), 20);
});

test("legal Human Tough works through builder statistics without a combat hook", () => {
	const build = buildLegalCharacter({
		...sampleSelection(),
		species: { id: "human", skill: "insight" },
		humanOriginFeat: { name: "tough" },
	});
	assert.equal(featRegistry.tough.combatHook, undefined);
	assert.equal(build.character.hitPoints, 16);
	const encounter = new EncounterState([combatantInputForBuild(build, "hero")]);
	new CombatEngine(encounter, { roller: new FixedDiceRoller([]) });
	assert.equal(encounter.state("hero").hitPoints, 16);
});

test("metadata-only feat branches remain visible while unknown raw IDs reject", () => {
	const build = buildLegalCharacter({
		...sampleSelection(4),
		progression: [
			{
				level: 4,
				feat: {
					name: "charger",
					abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }],
				},
			},
		],
	});
	const encounter = new EncounterState([
		combatantInputForBuild(build, "hero"),
		{ id: "target", definition: new BaseMonster("Target", 10, 100) },
	]);
	const engine = new CombatEngine(encounter, {
		roller: new FixedDiceRoller([10, 4]),
		strategy: { useFeature: () => false },
	});
	engine.beginTurn("hero");
	assert.ok(engine.resolveAttackAction("hero", "target").attacks[0]?.limitations.includes("charger.charge-attack"));
	assert.throws(
		() =>
			new BaseCharacter(4, new BaseClass([]), Greatsword, "strength", stats, 16, 50, [
				{ name: "unknown-feat" } as unknown as FeatSelection,
			]),
		/Unsupported feat selection/,
	);
});

test("constructor and builder validate raw selections and apply ASI exactly once", () => {
	const direct = new BaseCharacter(4, new BaseClass([Greatsword]), Greatsword, "strength", stats, 16, 50, [asi]);
	const built = buildCharacter({
		level: 4,
		characterClass: new BaseClass([Greatsword]),
		weapon: Greatsword,
		weaponPrimaryStat: "strength",
		stats,
		feats: [asi],
	});
	assert.equal(direct.stats.strength, 18);
	assert.deepEqual(built.stats, direct.stats);
	assert.equal(stats.strength, 16);
	assert.equal(Object.isFrozen(direct.feats), true);
	assert.equal(Object.isFrozen(direct.feats[0]?.abilityScoreImprovement), true);
	assert.throws(
		() => new BaseCharacter(3, new BaseClass([]), Greatsword, "strength", stats, 16, 50, [asi]),
		/requires level/,
	);
	assert.throws(
		() =>
			new BaseCharacter(4, new BaseClass([]), Greatsword, "strength", { ...stats, strength: 12 }, 16, 50, [
				{ name: EFeatName.GREAT_WEAPON_MASTER, abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
			]),
		/requires Strength/,
	);
	assert.throws(
		() =>
			new BaseCharacter(4, new BaseClass([]), Greatsword, "strength", stats, 16, 50, [
				{ name: EFeatName.SAVAGE_ATTACKER },
				{ name: EFeatName.SAVAGE_ATTACKER },
			]),
		/not repeatable/,
	);
});

test("public engine automatically resolves all five feats: crit38, HP30→0, one Hew11, HP25→14", () => {
	const f = createFiveFeatScenario();
	assert.equal(f.character.stats.strength, 18);
	assert.equal(f.baseStats.strength, 13);
	const result = f.run();
	assert.equal(result.hit.isCrit, true);
	assert.deepEqual(result.damage?.byType, { slashing: 21, piercing: 17 });
	assert.equal(result.damage?.rolledDamage, 38);
	assert.equal(result.damage?.hp.previousHp, 30);
	assert.equal(result.damage?.hp.currentHp, 0);
	assert.equal(result.damage?.hp.reducedToZero, true);
	assert.equal(result.damage?.hp.hpLost, 30);
	const dice = result.damage ? allDamageDice(result.damage.components) : [];
	assert.deepEqual(
		dice.map((die) => die.value),
		[2, 3, 4, 5, 7, 8, 2],
	);
	assert.equal(dice[4]?.rerolledFrom, 1);
	assert.equal(dice[6]?.provenance, "additional");
	const selection = result.decisions.find((decision) => decision.feature === "savage-attacker.weapon-roll");
	assert.deepEqual(
		selection?.candidates?.map((pool) => allDamageDice(pool).map((die) => die.value)),
		[
			[1, 1, 1, 1],
			[2, 3, 4, 5],
		],
	);
	assert.equal(result.triggeredAttacks.length, 1);
	const hew = result.triggeredAttacks[0];
	assert.equal(hew?.source, "feat.great-weapon-master.hew");
	assert.deepEqual(hew?.weapon, result.weapon);
	assert.equal(result.weapon?.category, "melee");
	assert.equal(result.weapon?.properties.includes("heavy"), true);
	assert.equal(hew?.targetId, "second");
	assert.equal(hew?.actionSource, "bonus-action");
	assert.equal(hew?.damage?.rolledDamage, 11);
	assert.deepEqual(hew?.damage?.byType, { slashing: 7, piercing: 4 });
	assert.equal(hew?.damage?.hp.previousHp, 25);
	assert.equal(hew?.damage?.hp.currentHp, 14);
	assert.equal(hew?.triggeredAttacks.length, 0);
	assert.deepEqual(hew?.decisions, []);
	assert.equal(f.encounter.canUseBonusAction("hero"), false);
	assert.equal(f.encounter.effectiveSpeed("first"), 0);
	assert.equal(
		f.encounter.effectsOn("first").find((effect) => effect.kind === "slasher.hamstring")?.speedReduction,
		10,
	);
	assert.equal(f.encounter.hasAttackDisadvantage("first"), true);
	assert.equal(f.encounter.effectiveSpeed("second"), 30);
	assert.equal(f.encounter.hasUsed("hero", "savage-attacker"), true);
	assert.equal(f.encounter.hasUsed("hero", "piercer.puncture"), true);
	assert.equal(f.encounter.hasUsed("hero", "slasher.hamstring"), true);
	assert.equal(f.roller.remaining, 0);
	assert.equal(
		result.limitations.some((limitation) => limitation.includes("unlimited")),
		false,
	);
});

test("optional strategy declines all chosen benefits while mandatory Slasher critical still applies", () => {
	const f = createFiveFeatScenario({
		rolls: [20, 1, 1, 1, 1, 1, 8],
		strategy: {
			useFeature: () => false,
			choosePunctureDie: () => null,
			applyPiercerCritical: () => false,
			chooseHewTarget: () => null,
		},
	});
	const result = f.run();
	assert.equal(result.damage?.rolledDamage, 17);
	assert.equal(result.damage?.components.length, 2);
	assert.equal(result.triggeredAttacks.length, 0);
	assert.equal(f.encounter.effectiveSpeed("first"), 30);
	assert.equal(f.encounter.hasAttackDisadvantage("first"), true);
	assert.equal(f.encounter.canUseBonusAction("hero"), true);
	assert.equal(f.encounter.hasUsed("hero", "savage-attacker"), false);
	assert.equal(f.encounter.hasUsed("hero", "piercer.puncture"), false);
	assert.equal(f.encounter.hasUsed("hero", "slasher.hamstring"), false);
	assert.equal(f.roller.remaining, 0);
});

test("declining Piercer Enhanced Critical alone preserves Puncture and all other default effects", () => {
	const f = createFiveFeatScenario({
		rolls: [20, 1, 1, 1, 1, 2, 3, 4, 5, 1, 8, 7, 10, 1, 2, 4],
		strategy: { applyPiercerCritical: () => false },
	});
	const result = f.run();
	assert.equal(result.damage?.rolledDamage, 36);
	assert.equal(
		result.damage?.components.some((component) => component.source === "feat.piercer.enhanced-critical"),
		false,
	);
	assert.equal(f.encounter.hasUsed("hero", "piercer.puncture"), true);
	assert.equal(result.triggeredAttacks[0]?.damage?.rolledDamage, 11);
	assert.equal(f.roller.remaining, 0);
});

test("explicit same-ID custom hook replaces that default only, without mutating base registry", () => {
	const f = createFiveFeatScenario({
		rolls: [20, 1, 1, 1, 1, 1, 8, 2, 7],
		strategy: { chooseHewTarget: () => null },
		hooks: [{ id: "feat.savage-attacker", featName: "savage-attacker" }],
	});
	const result = f.run();
	assert.equal(result.damage?.rolledDamage, 28);
	assert.equal(f.encounter.hasUsed("hero", "savage-attacker"), false);
	assert.equal(f.encounter.hasUsed("hero", "piercer.puncture"), true);
	assert.equal(typeof featRegistry["savage-attacker"].combatHook?.weaponDamage, "function");
	assert.equal(f.roller.remaining, 0);
});

test("effects expire only at next source turn and independent public scenario instances stay isolated", () => {
	const first = createFiveFeatScenario();
	const second = createFiveFeatScenario();
	first.run();
	assert.equal(second.encounter.state("first").hitPoints, 30);
	assert.equal(second.encounter.hasUsed("hero", "savage-attacker"), false);
	assert.deepEqual(second.encounter.effectsOn("first"), []);
	first.engine.endTurn();
	first.engine.beginTurn("second");
	assert.equal(first.encounter.effectiveSpeed("first"), 0);
	assert.equal(
		first.encounter.effectsOn("first").find((effect) => effect.kind === "slasher.hamstring")?.speedReduction,
		10,
	);
	first.engine.endTurn();
	first.engine.beginTurn("hero");
	assert.equal(first.encounter.effectiveSpeed("first"), 0);
	assert.equal(first.encounter.effectsOn("first").length, 0);
	assert.equal(first.encounter.hasAttackDisadvantage("first"), false);
	assert.equal(first.encounter.hasUsed("hero", "savage-attacker"), false);
	assert.equal(second.run().damage?.rolledDamage, 38);
});

test("Hew's kill trigger includes Melee weapon damage on a miss (Graze interaction)", () => {
	const hero = new BaseCharacter(
		5,
		new BaseClass([Greatsword]),
		Greatsword,
		"strength",
		{ ...stats, strength: 17 },
		16,
		50,
		[{ name: EFeatName.GREAT_WEAPON_MASTER, abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] }],
	);
	const encounter = new EncounterState([
		{ id: "hero", definition: hero },
		{ id: "first", definition: new BaseMonster("First", 100, 3) },
		{ id: "second", definition: new BaseMonster("Second", 10, 25) },
	]);
	const roller = new FixedDiceRoller([1, 10, 1, 2]);
	const engine = new CombatEngine(encounter, {
		roller,
		hooks: [
			{
				id: "test.weapon-miss-damage",
				attackModifiers: () => [
					{
						source: "test.graze",
						miss: {
							componentFns: [
								() => [
									{
										id: "test.graze",
										source: "weapon.graze",
										origin: "weapon",
										damageType: "slashing",
										dice: [],
										flatBonus: 4,
										doublesOnCrit: false,
									},
								],
							],
						},
					},
				],
			},
		],
	});
	engine.beginTurn("hero");
	const result = engine.resolveSingleAttack({
		actorId: "hero",
		targetId: "first",
		actionSource: "attack-action",
		mode: "melee",
	});
	assert.equal(result.hit.isHit, false);
	assert.equal(result.damage?.hp.reducedToZero, true);
	assert.equal(result.triggeredAttacks.length, 1);
	assert.equal(result.triggeredAttacks[0]?.targetId, "second");
	assert.equal(result.triggeredAttacks[0]?.damage?.rolledDamage, 7);
	assert.equal(encounter.canUseBonusAction("hero"), false);
	assert.equal(roller.remaining, 0);
});
