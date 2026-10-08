import assert from "node:assert/strict";
import test from "node:test";
import { CombatEngine } from "../combat/AttackResolver.ts";
import { EncounterState } from "../combat/EncounterState.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { deriveArmorClass } from "../Items/Armor.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import {
	assertLegalCharacterBuild,
	buildLegalCharacter,
	type CharacterBuildSelection,
	combatantInputForBuild,
	validatePointBuy,
} from "./CharacterBuild.ts";

/** Independent acceptance oracles, rather than builder-internal metadata as expected values.
 * Basic Rules 2024: Creating a Character, Barbarian, Equipment; checked 2026-10-08.
 * https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character
 * https://www.dndbeyond.com/sources/dnd/br-2024/character-classes#Barbarian
 * https://www.dndbeyond.com/sources/dnd/br-2024/equipment
 * PHB 2024 Weapon Master p.209, Skill Expert p.207, Boon of Fortitude p.210.
 */
function reviewSelection(level = 1) {
	return {
		ruleset: "phb-2024",
		className: "barbarian",
		level,
		...(level >= 3 ? { subclass: "berserker", primalKnowledgeSkill: "perception" } : {}),
		pointBuy: { strength: 15, dexterity: 14, constitution: 13, intelligence: 8, wisdom: 12, charisma: 10 },
		background: {
			id: "soldier",
			abilityScoreIncreases: [
				{ abilityScore: "strength", amount: 1 },
				{ abilityScore: "constitution", amount: 2 },
			],
			toolChoice: "dice-set",
		},
		species: { id: "dwarf" },
		classSkills: ["nature", "survival"],
		progression: ([4, 8, 12, 16, 19] as const)
			.filter((earned) => earned <= level)
			.map((earned) => ({
				level: earned,
				feat: {
					name: "ability-score-improvement",
					abilityScoreImprovement: [{ abilityScore: "intelligence", amount: 2 }],
				},
			})),
		equipment: {
			armorId: "none",
			shield: false,
			weapons: [{ id: "mace", weaponId: "mace" }],
			hands: { left: "mace", right: null },
		},
		masteredWeaponIds: [],
	} satisfies CharacterBuildSelection;
}

test("review: the independent point-buy boundary distinguishes 27 from 28 points", () => {
	const threeFifteens = { strength: 15, dexterity: 15, constitution: 15, intelligence: 8, wisdom: 8, charisma: 8 };
	assert.doesNotThrow(() => validatePointBuy(threeFifteens));
	assert.throws(() => validatePointBuy({ ...threeFifteens, charisma: 9 }), /27-point/);
	assert.throws(() => validatePointBuy({ ...threeFifteens, intelligence: 7 }), /8 to 15/);
	assert.throws(() => validatePointBuy({ ...threeFifteens, intelligence: 16 }), /8 to 15/);
	assert.throws(() => validatePointBuy({ ...threeFifteens, strength: 14.5 }), /8 to 15/);
});

test("review: Origin spell access does not grant the named Spellcasting prerequisite", () => {
	const base = reviewSelection(4);
	assert.throws(
		() =>
			buildLegalCharacter({
				...base,
				background: {
					id: "sage",
					abilityScoreIncreases: [
						{ abilityScore: "constitution", amount: 1 },
						{ abilityScore: "wisdom", amount: 2 },
					],
					featChoices: {
						spellList: "wizard",
						spellcastingAbility: "wisdom",
						cantrips: ["fire-bolt", "mage-hand"],
						spells: ["shield"],
					},
				},
				progression: [
					{ level: 4, feat: { name: "war-caster", abilityScoreImprovement: [{ abilityScore: "wisdom", amount: 1 }] } },
				],
			}),
		/named feature/,
	);
});

test("review: level boundaries earn exactly the five published Barbarian feat slots", () => {
	const expected = new Map([
		[1, 0],
		[3, 0],
		[4, 1],
		[7, 1],
		[8, 2],
		[11, 2],
		[12, 3],
		[15, 3],
		[16, 4],
		[18, 4],
		[19, 5],
		[20, 5],
	]);
	for (const [level, count] of expected) {
		const selection = reviewSelection(level);
		const character = buildLegalCharacter(selection).character;
		assert.equal(character.feats.length, count + 1, `level ${level}`);
		assert.equal(character.stats.intelligence, 8 + count * 2, `ASI applied once at level ${level}`);
		if (count > 0)
			assert.throws(() => buildLegalCharacter({ ...selection, progression: selection.progression.slice(1) }), /slots/);
	}
});

test("review: slot chronology precedes prerequisite checks, regardless of input order", () => {
	const selection = reviewSelection(8);
	const initial = {
		...selection,
		pointBuy: { strength: 10, dexterity: 15, constitution: 14, intelligence: 10, wisdom: 14, charisma: 8 },
		background: {
			...selection.background,
			abilityScoreIncreases: [
				{ abilityScore: "strength", amount: 2 },
				{ abilityScore: "constitution", amount: 1 },
			],
		},
	} satisfies CharacterBuildSelection;
	const qualified = buildLegalCharacter({
		...initial,
		progression: [
			{
				level: 8,
				feat: { name: "great-weapon-master", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
			},
			{
				level: 4,
				feat: {
					name: "ability-score-improvement",
					abilityScoreImprovement: [
						{ abilityScore: "strength", amount: 1 },
						{ abilityScore: "dexterity", amount: 1 },
					],
				},
			},
		],
	});
	assert.equal(qualified.character.stats.strength, 14);
	assert.equal(qualified.character.stats.dexterity, 16);
	assert.deepEqual(
		qualified.character.feats.map((feat) => feat.acquiredAt),
		[1, 4, 8],
	);
	assert.throws(
		() =>
			buildLegalCharacter({
				...initial,
				progression: [
					{
						level: 4,
						feat: { name: "great-weapon-master", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
					},
					{
						level: 8,
						feat: {
							name: "ability-score-improvement",
							abilityScoreImprovement: [{ abilityScore: "dexterity", amount: 2 }],
						},
					},
				],
			}),
		/Strength 13 before/,
	);
});

test("review: Epic ASI, Primal Champion and retroactive Constitution produce independent HP and AC totals", () => {
	const progression: CharacterBuildSelection["progression"] = [
		{
			level: 4,
			feat: { name: "ability-score-improvement", abilityScoreImprovement: [{ abilityScore: "strength", amount: 2 }] },
		},
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
				abilityScoreImprovement: [
					{ abilityScore: "constitution", amount: 1 },
					{ abilityScore: "dexterity", amount: 1 },
				],
			},
		},
		{
			level: 19,
			feat: { name: "boon-of-fortitude", abilityScoreImprovement: [{ abilityScore: "constitution", amount: 1 }] },
		},
	];
	const selection = {
		...reviewSelection(20),
		pointBuy: { strength: 15, dexterity: 13, constitution: 15, intelligence: 8, wisdom: 12, charisma: 8 },
		progression,
	};
	const before = buildLegalCharacter({ ...selection, level: 19 }).character;
	const champion = buildLegalCharacter(selection).character;
	assert.deepEqual(
		[before.stats.strength, before.stats.constitution, before.armorClass, before.hitPoints],
		[20, 21, 17, 292],
	);
	assert.deepEqual(
		[champion.stats.strength, champion.stats.constitution, champion.armorClass, champion.hitPoints],
		[24, 25, 19, 345],
	);
	assert.equal(champion.getSavingThrowBonus("strength"), 13);
	assert.equal(champion.getSavingThrowBonus("constitution"), 13);
});

test("review: independent armor values include negative Dex, shields and medium armor caps", () => {
	const lowDex = { strength: 10, dexterity: 8, constitution: 16, intelligence: 10, wisdom: 10, charisma: 10 };
	const highDex = { ...lowDex, dexterity: 18 };
	assert.equal(deriveArmorClass(lowDex, "none", false), 12);
	assert.equal(deriveArmorClass(lowDex, "none", true), 14);
	assert.equal(deriveArmorClass(lowDex, "studded-leather", false), 11);
	assert.equal(deriveArmorClass(lowDex, "half-plate", true), 16);
	assert.equal(deriveArmorClass(lowDex, "plate", false), 18);
	assert.equal(deriveArmorClass(highDex, "half-plate", false), 17);
	assert.equal(deriveArmorClass(highDex, "half-plate", true, true), 20);
});

test("review: heavy armor Strength is a Speed penalty rather than a build prerequisite", () => {
	const selection = reviewSelection(5);
	const build = buildLegalCharacter({
		...selection,
		pointBuy: { strength: 8, dexterity: 8, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
		progression: [
			{
				level: 4,
				feat: { name: "heavily-armored", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
			},
		],
		equipment: { ...selection.equipment, armorId: "plate" },
	});
	assert.equal(build.character.stats.strength, 10);
	assert.equal(build.character.armorClass, 18);
	assert.equal(build.character.speed, 20);
});

test("review: a Two-Handed weapon can be held in one hand until the attack needs its grip", () => {
	const selection = reviewSelection();
	const build = buildLegalCharacter({
		...selection,
		equipment: {
			...selection.equipment,
			weapons: [{ id: "axe", weaponId: "greataxe" }],
			hands: { left: "axe", right: null },
		},
	});
	const encounter = new EncounterState([
		combatantInputForBuild(build, "hero"),
		{ id: "target", definition: new BaseMonster("Target", 10, 100) },
	]);
	const engine = new CombatEngine(encounter, {
		roller: new FixedDiceRoller([10, 4]),
		strategy: { useFeature: () => false, useOptionalFeature: () => false },
	});
	engine.beginTurn("hero");
	assert.equal(engine.resolveAttackAction("hero", "target").totalDamage, 7);
	assert.deepEqual(encounter.state("hero").hands, { left: "axe", right: "axe" });
});

test("review: holding a Two-Handed weapon beside a shield is legal while attacking with it is unavailable", () => {
	const selection = reviewSelection();
	const build = buildLegalCharacter({
		...selection,
		equipment: {
			...selection.equipment,
			shield: true,
			weapons: [{ id: "axe", weaponId: "greataxe" }],
			hands: { left: "axe", right: "$shield" },
		},
	});
	const encounter = new EncounterState([
		combatantInputForBuild(build, "hero"),
		{ id: "target", definition: new BaseMonster("Target", 10, 100) },
	]);
	const engine = new CombatEngine(encounter, { roller: new FixedDiceRoller([]) });
	engine.beginTurn("hero");
	assert.deepEqual(engine.legalAttackCandidates("hero", "target"), []);
});

test("review: Primal Knowledge grants another class skill before later Skill Expert selection", () => {
	const selection = reviewSelection(4);
	const build = buildLegalCharacter({
		...selection,
		progression: [
			{
				level: 4,
				feat: {
					name: "skill-expert",
					abilityScoreImprovement: [{ abilityScore: "wisdom", amount: 1 }],
					choices: { skills: ["medicine"], expertise: "perception" },
				},
			},
		],
	});
	assert.equal(build.character.buildData?.skills.includes("perception"), true);
	assert.deepEqual(build.character.buildData?.expertise, ["perception"]);
	const duplicateSkill = { ...selection, primalKnowledgeSkill: "nature" as const };
	const missingSkill = { ...selection };
	Reflect.deleteProperty(missingSkill, "primalKnowledgeSkill");
	assert.throws(() => buildLegalCharacter(duplicateSkill), /Primal Knowledge/);
	assert.throws(() => buildLegalCharacter(missingSkill), /Primal Knowledge/);
});

test("review: feat Weapon Master adds a ranged entitlement independently of class melee selections", () => {
	const selection = reviewSelection(4);
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
			weapons: [{ id: "bow", weaponId: "longbow" }],
			hands: { left: "bow", right: "bow" },
		},
		masteredWeaponIds: ["club", "mace", "greataxe"],
		stock: { ammunition: { arrow: 1 } },
	});
	assert.deepEqual(build.combatDefaults.masteredWeaponIds, ["club", "mace", "greataxe", "longbow"]);
	assert.doesNotThrow(
		() =>
			new CombatEngine(new EncounterState([combatantInputForBuild(build, "hero")]), {
				roller: new FixedDiceRoller([]),
			}),
	);
});

test("review: factories detach the mutable encounter graph without reapplying ASIs", () => {
	const source = reviewSelection(4);
	const build = buildLegalCharacter(source);
	const one = new EncounterState([combatantInputForBuild(build, "hero")]);
	const two = new EncounterState([combatantInputForBuild(build, "hero")]);
	assert.notEqual(one.definition("hero"), two.definition("hero"));
	assert.notEqual(one.definition("hero").stats, two.definition("hero").stats);
	assert.equal(one.definition("hero").stats.intelligence, 10);
	assert.equal(two.definition("hero").stats.intelligence, 10);
	one.state("hero").classState["persistent.fixture"] = 99;
	one.state("hero").hitPoints = 1;
	one.state("hero").conditions.push({ name: "prone" });
	one.state("hero").spentWeaponInstanceIds.add("mace");
	assert.equal(two.state("hero").classState["persistent.fixture"], undefined);
	assert.equal(two.state("hero").hitPoints, build.character.hitPoints);
	assert.deepEqual(two.state("hero").conditions, []);
	assert.equal(two.state("hero").spentWeaponInstanceIds.size, 0);
	assert.equal(source.pointBuy.intelligence, 8);
	assert.equal(build.character.stats.intelligence, 10);
	assert.throws(() => assertLegalCharacterBuild({ ...build }), /factory-validated/);
	assert.throws(() => assertLegalCharacterBuild(JSON.parse(JSON.stringify(build))), /factory-validated/);
	assert.doesNotThrow(() => buildLegalCharacter(JSON.parse(JSON.stringify(build.selection))));
});

test("review: an empty weapon inventory remains empty while an Unarmed Strike deals damage", () => {
	const base = reviewSelection();
	const build = buildLegalCharacter({
		...base,
		equipment: { ...base.equipment, weapons: [], hands: { left: null, right: null } },
	});
	const encounter = new EncounterState([
		combatantInputForBuild(build, "hero"),
		{ id: "target", definition: new BaseMonster("Target", 15, 100) },
	]);
	const engine = new CombatEngine(encounter, {
		roller: new FixedDiceRoller([10]),
		strategy: { useFeature: () => false, useOptionalFeature: () => false },
	});
	assert.deepEqual(encounter.weapons("hero"), []);
	assert.deepEqual(encounter.masteredWeaponNames("hero"), []);
	engine.beginTurn("hero");
	const result = engine.resolveAttackAction("hero", "target", { unarmed: true });
	assert.equal(result.totalDamage, 4);
	assert.deepEqual(encounter.weapons("hero"), []);
	assert.deepEqual(encounter.state("hero").hands, { left: null, right: null });
});

test("review: validated provenance cannot retain mutated stats, equipment or chronological feat selections", () => {
	const build = buildLegalCharacter(reviewSelection(4));
	assert.equal(Reflect.set(build.character.stats, "strength", 30), false);
	assert.equal(Reflect.set(build.character, "hitPoints", 1), false);
	assert.equal(Reflect.set(build.selection.pointBuy, "strength", 8), false);
	assert.equal(Reflect.set(build.selection.equipment.hands, "left", null), false);
	assert.equal(Reflect.set(build.combatDefaults.initialHands ?? {}, "left", null), false);
	const increase = build.selection.progression[0]?.feat.abilityScoreImprovement?.[0];
	assert.ok(increase);
	assert.equal(Reflect.set(increase, "amount", 20), false);
	assert.throws(() => Object.defineProperty(build, "character", { value: {} }), TypeError);
	assert.throws(
		() => Array.prototype.push.call(build.selection.equipment.weapons, { id: "forged", weaponId: "greatsword" }),
		TypeError,
	);
	assert.doesNotThrow(() => assertLegalCharacterBuild(build));
	const encounter = new EncounterState([combatantInputForBuild(build, "hero")]);
	assert.equal(encounter.definition("hero").stats.strength, 16);
	assert.equal(encounter.definition("hero").stats.intelligence, 10);
	assert.deepEqual(
		encounter.weapons("hero").map((instance) => instance.id),
		["mace"],
	);
	assert.deepEqual(encounter.state("hero").hands, { left: "mace", right: null });
});
