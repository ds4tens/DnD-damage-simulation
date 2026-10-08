import assert from "node:assert/strict";
import test from "node:test";
import { CombatEngine } from "../combat/AttackResolver.ts";
import { EncounterState } from "../combat/EncounterState.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { featMetadata } from "../feats/FeatTypes.ts";
import { armorCatalog, deriveArmorClass, deriveBarbarianHitPoints } from "../Items/Armor.ts";
import { Club } from "../Items/Weapon/WeaponList.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import {
	assertLegalCharacterBuild,
	assessBuildSupport,
	buildLegalCharacter,
	type CharacterBuildSelection,
	combatantInputForBuild,
	validatePointBuy,
} from "./CharacterBuild.ts";
import { sampleSelection } from "./CharacterBuildTestFixtures.ts";
import { backgroundMetadata, speciesMetadata } from "./Origins.ts";

test("complete factual PHB2024 catalogs retain source pages and separate benefit statuses", () => {
	assert.equal(Object.keys(featMetadata).length, 75);
	assert.equal(Object.keys(backgroundMetadata).length, 16);
	assert.equal(Object.keys(speciesMetadata).length, 10);
	assert.equal(Object.keys(armorCatalog).length, 13);
	assert.equal(featMetadata["war-caster"].requiredFeaturesAnyOf.includes("Spellcasting"), true);
	assert.equal(featMetadata["boon-of-irresistible-offense"].abilityScoreImprovement.maximumScore, 30);
	assert.equal(featMetadata["great-weapon-master"].source.page, 204);
});
test("27-point buy validates independent published costs and pre-background range", () => {
	validatePointBuy(sampleSelection().pointBuy);
	assert.throws(() => validatePointBuy({ ...sampleSelection().pointBuy, charisma: 15 }), /27-point/);
	assert.throws(() => validatePointBuy({ ...sampleSelection().pointBuy, strength: 16 }), /8 to 15/);
	validatePointBuy({ strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 });
});
test("legal factory earns slots by level, rejects raw/serialized provenance and detaches definitions", () => {
	const selection = sampleSelection(4);
	const build = buildLegalCharacter(selection);
	assert.equal(build.character.stats.strength, 19);
	assert.equal(selection.pointBuy.strength, 15);
	assert.equal(build.character.feats.length, 2);
	assert.equal(combatantInputForBuild(build, "hero").definition, build.character);
	assert.equal(Object.isFrozen(build.character.stats), true);
	assert.throws(() => assertLegalCharacterBuild({ ...build }), /factory-validated/);
	assert.throws(() => assertLegalCharacterBuild(JSON.parse(JSON.stringify(build))), /factory-validated/);
	assert.throws(() => buildLegalCharacter({ ...selection, progression: [] }), /slots/);
	assert.throws(() => buildLegalCharacter({ ...sampleSelection(), subclass: "berserker" }), /before level 3/);
	assert.equal(Object.isFrozen(Club), false);
});
test("Epic19 then Primal Champion20 follows different caps and retroactive HP Constitution", () => {
	const selection = sampleSelection(20);
	const build = buildLegalCharacter({
		...selection,
		progression: [
			{
				level: 4,
				feat: { name: "great-weapon-master", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
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
	});
	assert.equal(build.character.stats.strength, 25);
	assert.equal(build.character.stats.constitution, 23);
	assert.equal(build.character.hitPoints, 12 + 6 + 19 * (7 + 6) + 20);
});
test("prerequisites are checked before the own ASI and at actual acquisition", () => {
	const s = sampleSelection(4);
	const dex12 = { ...s.pointBuy, dexterity: 12 };
	assert.throws(
		() =>
			buildLegalCharacter({
				...s,
				pointBuy: dex12,
				progression: [
					{
						level: 4,
						feat: { name: "crossbow-expert", abilityScoreImprovement: [{ abilityScore: "dexterity", amount: 1 }] },
					},
				],
			}),
		/prerequisite/,
	);
	assert.throws(
		() =>
			buildLegalCharacter({
				...s,
				progression: [
					{
						level: 4,
						feat: {
							name: "boon-of-combat-prowess",
							abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }],
						},
					},
				],
			}),
		/level 19/,
	);
	assert.throws(
		() => buildLegalCharacter({ ...s, progression: [{ level: 4, feat: { name: "archery" } }] }),
		/named feature/,
	);
	assert.throws(
		() =>
			buildLegalCharacter({
				...s,
				progression: [
					{ level: 4, feat: { name: "war-caster", abilityScoreImprovement: [{ abilityScore: "wisdom", amount: 1 }] } },
				],
			}),
		/named feature/,
	);
});
test("Human Origin slot, background spell list and repeated Magic Initiate enforce choices", () => {
	const s = sampleSelection();
	const human = buildLegalCharacter({
		...s,
		species: { id: "human", skill: "insight" },
		humanOriginFeat: { name: "tavern-brawler" },
	});
	assert.equal(human.character.feats.length, 2);
	assert.equal(human.combatDefaults.size, "medium");
	assert.throws(() => buildLegalCharacter({ ...s, species: { id: "human", skill: "insight" } }), /Origin feat/);
	assert.throws(() => buildLegalCharacter({ ...s, humanOriginFeat: { name: "tavern-brawler" } }), /Only Human/);
	const sage: CharacterBuildSelection = {
		...s,
		background: {
			id: "sage",
			abilityScoreIncreases: [
				{ abilityScore: "constitution", amount: 2 },
				{ abilityScore: "wisdom", amount: 1 },
			],
			featChoices: {
				spellList: "wizard",
				spellcastingAbility: "wisdom",
				cantrips: ["fire-bolt", "mage-hand"],
				spells: ["shield"],
			},
		},
	};
	assert.equal(buildLegalCharacter(sage).character.stats.constitution, 16);
	assert.throws(
		() =>
			buildLegalCharacter({
				...sage,
				background: {
					...sage.background,
					featChoices: { ...sage.background.featChoices, cantrips: ["guidance", "mage-hand"] },
				},
			}),
		/cantrip/,
	);
});
test("armor AC, shield hands, heavy negative Dex and fixed HP are derived from final build", () => {
	const s = sampleSelection();
	const shield = buildLegalCharacter({
		...s,
		equipment: { ...s.equipment, armorId: "half-plate", shield: true, hands: { left: "staff", right: "$shield" } },
	});
	assert.equal(shield.character.armorClass, 19);
	assert.equal(shield.character.hitPoints, 15);
	assert.throws(() => buildLegalCharacter({ ...s, equipment: { ...s.equipment, shield: true } }), /occupy/);
	const held = buildLegalCharacter({
		...s,
		equipment: { ...s.equipment, weapons: [{ id: "staff", weaponId: "greatsword" }] },
	});
	assert.deepEqual(held.combatDefaults.initialHands, { left: "staff", right: null });
	assert.equal(deriveArmorClass({ ...s.pointBuy, dexterity: 8 }, "plate", false), 18);
	assert.equal(deriveBarbarianHitPoints({ ...s.pointBuy, constitution: 18 }, 5, { tough: true }), 16 + 4 * 11 + 10);
});
test("acquired armor training, Resilient save grant, feat mastery and support gate keep distinct benefits", () => {
	const s = sampleSelection(8);
	const build = buildLegalCharacter({
		...s,
		progression: [
			{
				level: 4,
				feat: { name: "heavily-armored", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
			},
			{
				level: 8,
				feat: { name: "heavy-armor-master", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
			},
		],
		equipment: { ...s.equipment, armorId: "plate" },
	});
	assert.equal(build.character.armorCategory, "heavy");
	assert.equal(build.character.armorTrained, true);
	assert.equal(build.character.armorClass, 18);
	const charger = buildLegalCharacter({
		...sampleSelection(4),
		progression: [
			{ level: 4, feat: { name: "charger", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] } },
		],
	});
	assert.ok(charger.report.supportedBenefits.includes("charger.ability-score-increase"));
	assert.ok(charger.report.limitations.some((b) => b.id === "charger.charge-attack"));
	assert.throws(() => assessBuildSupport(charger, { requestedBenefits: ["charger.charge-attack"] }), /Unsupported/);
	assert.throws(() => assessBuildSupport(charger, { lighting: "darkness" }), /vision/);
});
test("factory allows untrained armor and actual combat applies Initiative cancellation and attack Disadvantage", () => {
	const s = sampleSelection(7);
	const build = buildLegalCharacter({ ...s, equipment: { ...s.equipment, armorId: "plate" } });
	assert.equal(build.character.armorTrained, false);
	assert.equal(build.character.armorClass, 18);
	const encounter = new EncounterState([
		combatantInputForBuild(build, "hero"),
		{ id: "target", definition: new BaseMonster("Target", 12, 1000), hitPointMode: "inexhaustible" },
	]);
	const roller = new FixedDiceRoller([12, 5, 18, 2, 18, 2]);
	const engine = new CombatEngine(encounter, {
		roller,
		distanceFor: () => 5,
		strategy: { useOptionalFeature: () => false, useFeature: () => false },
	});
	const scheduler = engine.createScheduler();
	assert.deepEqual(scheduler.initiative.find((entry) => entry.actorId === "hero")?.d20Rolls, [12]);
	scheduler.beginNextTurn();
	const action = engine.resolveAttackAction("hero", "target");
	assert.deepEqual(
		action.attacks.map((attack) => attack.hit.d20Rolls),
		[
			[18, 2],
			[18, 2],
		],
	);
	assert.equal(action.totalDamage, 0);
	assert.equal(roller.remaining, 0);
});
test("Primal Knowledge is earned at3, grants a new skill after Origin and is available to later expertise", () => {
	const s = sampleSelection(4);
	const { primalKnowledgeSkill: existingChoice, ...withoutChoice } = s;
	assert.equal(existingChoice, "perception");
	assert.throws(() => buildLegalCharacter(withoutChoice), /Primal Knowledge/);
	assert.throws(
		() => buildLegalCharacter({ ...sampleSelection(), primalKnowledgeSkill: "perception" }),
		/before level3/,
	);
	assert.throws(() => buildLegalCharacter({ ...s, primalKnowledgeSkill: "nature" }), /additional/);
	const build = buildLegalCharacter({
		...s,
		progression: [
			{
				level: 4,
				feat: {
					name: "skill-expert",
					abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }],
					choices: { skills: ["medicine"], expertise: "perception" },
				},
			},
		],
	});
	assert.equal(build.character.buildData?.skills.includes("perception"), true);
	assert.equal(build.character.buildData?.expertise.includes("perception"), true);
	assert.equal(build.character.medicineProficient, true);
});
test("Keen Mind and Observant grant chosen proficiency or Expertise using the actual skill list", () => {
	const s = sampleSelection(4);
	const keen = buildLegalCharacter({
		...s,
		pointBuy: { strength: 15, dexterity: 12, constitution: 14, intelligence: 13, wisdom: 8, charisma: 8 },
		progression: [
			{
				level: 4,
				feat: {
					name: "keen-mind",
					abilityScoreImprovement: [{ abilityScore: "intelligence", amount: 1 }],
					choices: { skills: ["nature"] },
				},
			},
		],
	});
	assert.equal(keen.character.buildData?.expertise.includes("nature"), true);
	assert.throws(
		() =>
			buildLegalCharacter({
				...s,
				pointBuy: { strength: 15, dexterity: 12, constitution: 14, intelligence: 13, wisdom: 8, charisma: 8 },
				progression: [
					{
						level: 4,
						feat: {
							name: "keen-mind",
							abilityScoreImprovement: [{ abilityScore: "intelligence", amount: 1 }],
							choices: { skills: ["perception"] },
						},
					},
				],
			}),
		/choices/,
	);
	const observer = buildLegalCharacter({
		...s,
		pointBuy: { ...s.pointBuy, wisdom: 13, dexterity: 12 },
		progression: [
			{
				level: 4,
				feat: {
					name: "observant",
					abilityScoreImprovement: [{ abilityScore: "wisdom", amount: 1 }],
					choices: { skills: ["insight"] },
				},
			},
		],
	});
	assert.equal(observer.character.buildData?.skills.includes("insight"), true);
	assert.equal(observer.character.buildData?.expertise.includes("insight"), false);
});
test("species and Epic Boon resistance choices apply to the cloned character definition", () => {
	const aasimar = buildLegalCharacter({ ...sampleSelection(), species: { id: "aasimar" } });
	assert.deepEqual(aasimar.character.defenses.resistances, ["necrotic", "radiant"]);
	const s = sampleSelection(19);
	const build = buildLegalCharacter({
		...s,
		progression: [
			...s.progression.filter((p) => p.level !== 19),
			{
				level: 19,
				feat: {
					name: "boon-of-energy-resistance",
					abilityScoreImprovement: [{ abilityScore: "constitution", amount: 1 }],
					choices: { damageTypes: ["cold", "radiant"] },
				},
			},
		],
	});
	assert.deepEqual(build.character.defenses.resistances, ["poison", "cold", "radiant"]);
	const malformed = JSON.parse(JSON.stringify({ ...sampleSelection(), species: { id: "gnome", lineage: "rock" } }));
	assert.throws(() => buildLegalCharacter(malformed), /spellcasting ability/);
});
