import assert from "node:assert/strict";
import test from "node:test";
import BaseCharacter, { defaultStatBlock } from "../character/BaseCharacter.ts";
import { buildLegalCharacter } from "../character/CharacterBuild.ts";
import { sampleSelection } from "../character/CharacterBuildTestFixtures.ts";
import type { CharacterBuildData } from "../character/CombatantData.ts";
import BaseClass from "../classes/BaseClass.ts";
import { CombatEngine } from "../combat/AttackResolver.ts";
import { EncounterState } from "../combat/EncounterState.ts";
import type { CombatStrategy } from "../combat/Strategy.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { Dagger } from "../Items/Weapon/WeaponList.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import type { FeatSelection } from "./FeatTypes.ts";

function fixture(
	rolls: number[],
	feats: FeatSelection[] = [],
	buildData?: CharacterBuildData,
	initialResources = {},
	strategy: Partial<CombatStrategy> = {},
) {
	const hero = new BaseCharacter(
		20,
		new BaseClass([Dagger]),
		Dagger,
		"strength",
		{ ...defaultStatBlock, strength: 16 },
		16,
		100,
		feats,
		buildData === undefined ? {} : { buildData },
	);
	const encounter = new EncounterState([
		{ id: "hero", definition: hero, initialResources },
		{ id: "target", definition: new BaseMonster("Target", 12, 1000), hitPointMode: "inexhaustible" },
	]);
	const roller = new FixedDiceRoller(rolls);
	const engine = new CombatEngine(encounter, {
		roller,
		strategy: {
			useOptionalFeature: (_s, id) => id !== "heroic-inspiration",
			useFeature: (_s, id) => id !== "boon-of-fate.improve-fate",
			...strategy,
		},
	});
	return { encounter, engine, roller };
}
const epic = (name: "boon-of-fate" | "boon-of-combat-prowess"): FeatSelection => ({
	name,
	abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }],
});

test("Lucky uses a point after the first d20, cancels Disadvantage and honors strategy decline", () => {
	const f = fixture([2, 3], [{ name: "lucky" }]);
	f.encounter.state("hero").conditions.push({ name: "poisoned" });
	f.engine.beginTurn("hero");
	const result = f.engine.resolveAttackAction("hero", "target").attacks[0];
	assert.deepEqual(result?.hit.d20Rolls, [2]);
	assert.equal(result?.hit.isHit, false);
	assert.equal(f.encounter.resourceRemaining("hero", "feat.lucky"), 5);
	assert.equal(f.roller.remaining, 1);
	const no = fixture([2, 3], [{ name: "lucky" }], undefined, {}, { useOptionalFeature: () => false });
	const declined = no.engine;
	declined.beginTurn("hero");
	declined.resolveAttackAction("hero", "target");
	assert.equal(no.encounter.resourceRemaining("hero", "feat.lucky"), 6);
});
test("Heroic Inspiration starts empty and Human gains it only after a completed Long Rest", () => {
	const selection = sampleSelection();
	const data = buildLegalCharacter({
		...selection,
		species: { id: "human", skill: "insight" },
		humanOriginFeat: { name: "tough" },
	}).character.buildData;
	const f = fixture([], [], data);
	assert.equal(f.encounter.resourceRemaining("hero", "heroic-inspiration"), 0);
	f.engine.recoverResources("hero", "short-rest");
	assert.equal(f.encounter.resourceRemaining("hero", "heroic-inspiration"), 0);
	f.engine.recoverResources("hero", "long-rest");
	assert.equal(f.encounter.resourceRemaining("hero", "heroic-inspiration"), 1);
	assert.equal(f.encounter.definition("hero") instanceof BaseCharacter, true);
	const ordinary = fixture([]);
	ordinary.engine.recoverResources("hero", "long-rest");
	assert.equal(ordinary.encounter.resourceRemaining("hero", "heroic-inspiration"), 0);
});
test("Heroic Inspiration rerolls a single damage die immediately and retains the lower replacement", () => {
	const f = fixture(
		[12, 3, 1],
		[],
		undefined,
		{ "heroic-inspiration": 1 },
		{
			useOptionalFeature: (s, id) => id === "heroic-inspiration" && s.roll?.kind === "damage",
			chooseFeatureOption: (_s, _id, choices) => (choices.includes("reroll") ? "reroll" : (choices[0] ?? null)),
		},
	);
	const engine = f.engine;
	engine.beginTurn("hero");
	const result = engine.resolveAttackAction("hero", "target").attacks[0];
	assert.equal(result?.damage?.appliedDamage, 4);
	assert.equal(f.encounter.resourceRemaining("hero", "heroic-inspiration"), 0);
	assert.equal(f.roller.remaining, 0);
});

test("Savage Attacker and Piercer reroll windows are classified as damage for Heroic Inspiration strategy", () => {
	for (const feats of [
		[{ name: "savage-attacker" }],
		[{ name: "piercer", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] }],
	] satisfies FeatSelection[][]) {
		let damageWindows = 0;
		const rolls = feats[0]?.name === "savage-attacker" ? [12, 4, 1, 4] : [12, 1, 1, 4];
		const f = fixture(
			rolls,
			feats,
			undefined,
			{ "heroic-inspiration": 1 },
			{
				useOptionalFeature: (s, id) =>
					id === "heroic-inspiration" && s.roll?.kind === "damage" && ++damageWindows === 2,
				chooseFeatureOption: (_s, _id, choices) => (choices.includes("reroll") ? "reroll" : (choices[0] ?? null)),
			},
		);
		f.engine.beginTurn("hero");
		assert.equal(f.engine.resolveAttackAction("hero", "target").attacks[0]?.damage?.appliedDamage, 7);
		assert.equal(f.encounter.resourceRemaining("hero", "heroic-inspiration"), 0);
		assert.equal(f.roller.remaining, 0);
	}
});
test("Halfling Luck survives participant cloning and keeps a replacement1 without recursion", () => {
	const data = buildLegalCharacter({ ...sampleSelection(), species: { id: "halfling" } }).character.buildData;
	const f = fixture([1, 1], [], data);
	f.engine.beginTurn("hero");
	const result = f.engine.resolveAttackAction("hero", "target").attacks[0];
	assert.equal(result?.hit.d20Roll, 1);
	assert.equal(result?.hit.isHit, false);
	assert.equal(f.roller.remaining, 0);
});
test("Halfling Luck rerolls only one physical d20 from an Advantage pair", () => {
	const data = buildLegalCharacter({ ...sampleSelection(), species: { id: "halfling" } }).character.buildData;
	const f = fixture([1, 2, 1], [], data);
	f.encounter.state("hero").conditions.push({ name: "invisible" });
	f.engine.beginTurn("hero");
	const hit = f.engine.resolveAttackAction("hero", "target").attacks[0]?.hit;
	assert.deepEqual(hit?.d20Rolls, [2, 1]);
	assert.equal(hit?.isHit, false);
	assert.equal(f.roller.remaining, 0);
});
test("Combat Prowess changes a natural1 miss to an ordinary hit and resets on the owner turn", () => {
	const f = fixture([1, 4, 1, 4], [epic("boon-of-combat-prowess")]);
	f.engine.beginTurn("hero");
	const first = f.engine.resolveAttackAction("hero", "target").attacks[0];
	assert.equal(first?.hit.isHit, true);
	assert.equal(first?.hit.isCrit, false);
	assert.equal(first?.damage?.appliedDamage, 7);
	assert.equal(f.encounter.resourceRemaining("hero", "feat.boon-of-combat-prowess"), 0);
	f.engine.endTurn();
	f.engine.beginTurn("target");
	assert.equal(f.encounter.resourceRemaining("hero", "feat.boon-of-combat-prowess"), 0);
	f.engine.endTurn();
	f.engine.beginTurn("hero");
	assert.equal(f.encounter.resourceRemaining("hero", "feat.boon-of-combat-prowess"), 1);
	f.engine.resolveAttackAction("hero", "target");
});
test("Boon of Fate sees failure, adds2d4 to a roll and cannot rescue automatic natural1", () => {
	const f = fixture(
		[2, 2, 2, 4],
		[epic("boon-of-fate")],
		undefined,
		{},
		{
			useOptionalFeature: () => false,
			useFeature: () => true,
			chooseFeatureOption: (_s, _id, choices) => (choices.includes("add") ? "add" : (choices[0] ?? null)),
		},
	);
	const engine = f.engine;
	engine.beginTurn("hero");
	const result = engine.resolveAttackAction("hero", "target").attacks[0];
	assert.equal(result?.hit.totalAttackRoll, 15);
	assert.equal(result?.hit.isHit, true);
	assert.equal(f.encounter.resourceRemaining("hero", "feat.boon-of-fate"), 0);
	engine.endTurn();
	engine.recoverResources("hero", "short-rest");
	assert.equal(f.encounter.resourceRemaining("hero", "feat.boon-of-fate"), 1);
	const natural = fixture(
		[1, 4, 4],
		[epic("boon-of-fate")],
		undefined,
		{},
		{ useOptionalFeature: () => false, useFeature: () => true, chooseFeatureOption: () => "add" },
	);
	const e = natural.engine;
	e.beginTurn("hero");
	assert.equal(e.resolveAttackAction("hero", "target").attacks[0]?.hit.isHit, false);
});
test("Boon of Fate modifies a visible post-save outcome within60ft, and natural20 saves can fail", () => {
	const f = fixture(
		[20, 4, 4],
		[epic("boon-of-fate")],
		undefined,
		{},
		{
			useOptionalFeature: (_s, id) => id === "boon-of-fate.improve-fate",
			chooseFeatureOption: (s, id, c) => {
				if (id === "boon-of-fate.saving-throw") {
					assert.equal("savingThrow" in s ? s.savingThrow?.success : undefined, true);
					return "subtract";
				}
				return c[0] ?? null;
			},
		},
	);
	// This fixture has explicit geometry because Fate must never infer range.
	const context = f.engine;
	context.beginTurn("hero");
	const result = context.resolveSavingThrow({ targetId: "hero", ability: "wisdom", dc: 15, source: "test.save" });
	assert.equal(result.natural, 20);
	assert.equal(result.total, 12);
	assert.equal(result.success, false);
	assert.equal(f.encounter.resourceRemaining("hero", "feat.boon-of-fate"), 0);
});
