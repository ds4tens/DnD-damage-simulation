import assert from "node:assert/strict";
import test from "node:test";
import { defaultStatBlock, type TStatBlock, type TStatsType } from "../../../src/character/BaseCharacter.ts";
import { buildCharacter } from "../../../src/character/build/CharacterBuilder.ts";
import BaseClass from "../../../src/classes/BaseClass.ts";
import {
	abilityScores,
	EFeatName,
	type FeatName,
	type FeatSelection,
	featMetadata,
} from "../../../src/feats/catalog/FeatTypes.ts";
import { applyAbilityScoreImprovement } from "../../../src/feats/selection/AbilityScoreImprovement.ts";
import { resolveFeatSelections } from "../../../src/feats/selection/FeatSelection.ts";
import { Greatsword } from "../../../src/items/weapons/WeaponList.ts";

const stats: TStatBlock = { ...defaultStatBlock, strength: 16, dexterity: 12 };
const increase = (abilityScore: TStatsType, amount: number) => ({ abilityScore, amount });
const asi = (...choices: ReturnType<typeof increase>[]): FeatSelection => ({
	name: "ability-score-improvement",
	abilityScoreImprovement: choices,
});
const half = (name: FeatName, abilityScore: TStatsType = "strength"): FeatSelection => ({
	name,
	abilityScoreImprovement: [increase(abilityScore, 1)],
});
const resolve = (feats: readonly FeatSelection[], overrides: Partial<TStatBlock> = {}, level = 4) =>
	resolveFeatSelections({ level, stats: { ...stats, ...overrides }, feats });

test("canonical metadata includes the five existing feats in the complete PHB2024 index", () => {
	assert.equal(EFeatName.ABILITY_SCORE_IMPROVEMENT, "ability-score-improvement");
	assert.equal(EFeatName.GREAT_WEAPON_MASTER, "great-weapon-master");
	assert.equal(Object.keys(featMetadata).length, 75);
	for (const name of Object.values(EFeatName)) {
		const rule = featMetadata[name];
		assert.equal(rule.repeatable, rule.name === "ability-score-improvement");
		assert.equal(rule.type, rule.name === "savage-attacker" ? "origin" : "general");
		assert.equal(Object.isFrozen(rule), true);
		assert.equal(Object.isFrozen(rule.abilityScoreImprovement), true);
		assert.equal(Object.isFrozen(rule.abilityScoreImprovement.allowedAbilityScores), true);
	}
	assert.equal(Object.isFrozen(featMetadata), true);
	assert.equal(featMetadata.piercer.minimumStrength, undefined);
	assert.equal(featMetadata.slasher.minimumStrength, undefined);
});

test("ASI accepts +2 in any stat and +1 in any two distinct stats", () => {
	for (const first of abilityScores) {
		assert.equal(resolve([asi(increase(first, 2))]).stats[first], stats[first] + 2);
		for (const second of abilityScores)
			if (first !== second) {
				const result = resolve([asi(increase(first, 1), increase(second, 1))]).stats;
				assert.equal(result[first], stats[first] + 1);
				assert.equal(result[second], stats[second] + 1);
			}
	}
	assert.equal(resolve([asi(increase("strength", 2)), asi(increase("strength", 2))]).stats.strength, 20);
});

test("increases cap at20 and never lower preexisting scores over20", () => {
	for (const score of [19, 20, 22])
		assert.equal(resolve([asi(increase("strength", 2))], { strength: score }).stats.strength, Math.max(score, 20));
	for (const name of ["piercer", "slasher", "great-weapon-master"] as const) {
		assert.equal(resolve([half(name)], { strength: 22 }).stats.strength, 22);
		assert.equal(resolve([half(name)], { strength: 20 }).stats.strength, 20);
	}
	const frozen = Object.freeze({ ...stats });
	assert.equal(applyAbilityScoreImprovement(frozen, [increase("strength", 2)]).strength, 18);
	assert.equal(frozen.strength, 16);
});

test("ASI rejects missing, malformed, duplicate and invalid point choices", () => {
	const invalid: FeatSelection[] = [
		{ name: "ability-score-improvement" },
		asi(),
		asi(increase("strength", 1)),
		asi(increase("strength", 3)),
		asi(increase("strength", -2)),
		asi(increase("strength", 1.5)),
		asi(increase("strength", 0)),
		asi(increase("strength", Number.NaN)),
		asi(increase("strength", Number.POSITIVE_INFINITY)),
		asi(increase("strength", 1), increase("strength", 1)),
		asi(increase("strength", 2), increase("dexterity", 1)),
		asi(increase("strength", 1), increase("dexterity", 1), increase("wisdom", 1)),
	];
	for (const selection of invalid) assert.throws(() => resolve([selection]), /Invalid ability score/);
	for (const choices of [null, {}, "strength", [{ abilityScore: "luck", amount: 2 }], [null]]) {
		assert.throws(
			() =>
				resolve([{ name: "ability-score-improvement", abilityScoreImprovement: choices } as unknown as FeatSelection]),
			/Invalid ability score/,
		);
	}
});

test("General feats require level4, Savage Attacker is Origin without ASI", () => {
	for (const selection of [
		asi(increase("strength", 2)),
		half("piercer"),
		half("slasher"),
		half("great-weapon-master"),
	]) {
		assert.throws(() => resolve([selection], {}, 3), /requires level 4/);
		assert.equal(resolve([selection], {}, 4).feats.length, 1);
	}
	const savage = resolve([{ name: "savage-attacker" }], {}, 1);
	assert.deepEqual(savage.stats, stats);
	assert.equal(savage.feats[0]?.type, "origin");
	assert.throws(
		() => resolve([{ name: "savage-attacker", abilityScoreImprovement: [increase("strength", 1)] }]),
		/Invalid ability score/,
	);
});

test("GWM checks STR13 before its own +1; selection order uses prior benefits", () => {
	assert.throws(() => resolve([half("great-weapon-master")], { strength: 12 }), /requires Strength 13 before/);
	assert.equal(resolve([half("great-weapon-master")], { strength: 13 }).stats.strength, 14);
	assert.equal(
		resolve([asi(increase("strength", 2)), half("great-weapon-master")], { strength: 11 }).stats.strength,
		14,
	);
	assert.throws(
		() => resolve([half("great-weapon-master"), asi(increase("strength", 2))], { strength: 11 }),
		/requires Strength/,
	);
});

test("half-feat choices are exact and Piercer/Slasher have no STRDEX13 prerequisite", () => {
	for (const name of ["piercer", "slasher"] as const) {
		for (const ability of ["strength", "dexterity"] as const)
			assert.equal(resolve([half(name, ability)], { strength: 10, dexterity: 10 }).stats[ability], 11);
		assert.throws(() => resolve([half(name, "constitution")]), /Invalid ability score/);
	}
	for (const name of ["piercer", "slasher", "great-weapon-master"] as const) {
		for (const choices of [
			undefined,
			[],
			[increase("strength", 2)],
			[increase("strength", 1), increase("dexterity", 1)],
		]) {
			assert.throws(
				() => resolve([{ name, ...(choices === undefined ? {} : { abilityScoreImprovement: choices }) }]),
				/Invalid ability score/,
			);
		}
	}
	assert.throws(() => resolve([half("great-weapon-master", "dexterity")]), /Invalid ability score/);
});

test("all four nonrepeatable feats reject duplicates; supplied metadata cannot bypass rules", () => {
	for (const name of ["savage-attacker", "piercer", "slasher", "great-weapon-master"] as const) {
		const selection: FeatSelection = name === "savage-attacker" ? { name } : half(name);
		assert.throws(() => resolve([selection, selection]), /not repeatable/);
	}
	assert.throws(() => resolve([{ ...half("great-weapon-master"), type: "origin" }], {}, 3), /Invalid feat category/);
	const forged = { ...half("great-weapon-master"), repeatable: true, minimumStrength: 0, minimumLevel: 0 };
	assert.throws(() => resolve([forged], { strength: 12 }), /requires Strength/);
	assert.throws(() => resolve([forged, forged]), /not repeatable/);
	for (const name of ["unknown", "toString", "__proto__", "great-weapon-mastery", "ablity-score-improvement"])
		assert.throws(() => resolve([{ name } as FeatSelection]), /Unsupported feat/);
});

test("builder resolves choices and keeps builds, stats and selection arrays independent", () => {
	const input = {
		level: 4,
		characterClass: new BaseClass([Greatsword]),
		weapon: Greatsword,
		weaponPrimaryStat: "strength" as const,
		stats: { ...stats },
		feats: [asi(increase("strength", 2))],
	};
	const first = buildCharacter(input);
	const second = buildCharacter(input);
	assert.equal(first.stats.strength, 18);
	assert.equal(input.stats.strength, 16);
	assert.equal(first.feats[0]?.type, "general");
	first.stats.strength = 5;
	const choice = first.feats[0]?.abilityScoreImprovement?.[0];
	assert.ok(choice);
	assert.throws(() => {
		choice.amount = 99;
	}, TypeError);
	assert.equal(second.stats.strength, 18);
	assert.equal(second.feats[0]?.abilityScoreImprovement?.[0]?.amount, 2);
	assert.equal(input.feats[0]?.abilityScoreImprovement?.[0]?.amount, 2);
	assert.throws(() => buildCharacter({ ...input, feats: [asi()] }), /Invalid ability score/);
});

test("local validation rejects invalid levels and stat values", () => {
	for (const level of [0, 21, 3.5, Number.NaN]) assert.throws(() => resolve([], {}, level), /Invalid character level/);
	for (const strength of [0, -1, 12.5, Number.NaN, Number.POSITIVE_INFINITY])
		assert.throws(() => resolve([], { strength }), /Invalid ability score/);
});

test("named Spellcasting prerequisite does not accept Pact Magic or merely casting spells", () => {
	const feat = half("boon-of-spell-recall", "intelligence");
	assert.deepEqual(featMetadata[feat.name].requiredFeaturesAnyOf, ["Spellcasting"]);
	for (const features of [[], ["Pact Magic"]] as const)
		assert.throws(
			() => resolveFeatSelections({ level: 19, stats, feats: [feat], context: { features } }),
			/Required named feature missing/,
		);
	assert.equal(
		resolveFeatSelections({ level: 19, stats, feats: [feat], context: { features: ["Spellcasting"] } }).feats.length,
		1,
	);
});

test("frozen inputs remain unchanged after successful and rejected multi-feat selections", () => {
	const choice = Object.freeze(increase("strength", 2));
	const selection = Object.freeze({
		name: "ability-score-improvement" as const,
		abilityScoreImprovement: Object.freeze([choice]),
	});
	const input = Object.freeze({ level: 4, stats: Object.freeze({ ...stats }), feats: Object.freeze([selection]) });
	const result = resolveFeatSelections(input);
	assert.equal(result.stats.strength, 18);
	assert.notEqual(result.stats, input.stats);
	assert.notEqual(result.feats[0], selection);
	const choices = result.feats[0]?.abilityScoreImprovement;
	assert.ok(choices);
	const detached = choices[0];
	assert.ok(detached);
	detached.amount = 1;
	assert.equal(choice.amount, 2);
	assert.throws(() => resolveFeatSelections({ ...input, feats: [selection, asi()] }), /Invalid ability score/);
	assert.equal(input.stats.strength, 16);
});
