import assert from "node:assert/strict";
import test from "node:test";
import { buildLegalCharacter, combatantInputForBuild } from "../character/CharacterBuild.ts";
import { sampleSelection } from "../character/CharacterBuildTestFixtures.ts";
import type { CharacterBuildSelection } from "../character/CharacterBuildTypes.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { Battleaxe } from "../Items/Weapon/WeaponList.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { runDprTrial } from "../simulation/DprSimulation.ts";
import { CombatEngine } from "./AttackResolver.ts";
import type { AttackActionOptions, AttackSelection } from "./CombatTypes.ts";
import { EncounterState } from "./EncounterState.ts";

// Basic Rules2024 Equipment/Thrown, checked2026-10-08:
// https://www.dndbeyond.com/sources/dnd/br-2024/equipment#Properties
// Explicit mode constrains all strategy candidates. Inventory preference ranks
// physical weapons without changing the selected scenario's attack mode.
function mixedSelection(level = 1): CharacterBuildSelection {
	return {
		...sampleSelection(level),
		equipment: {
			armorId: "none",
			shield: false,
			weapons: [
				{ id: "mace", weaponId: "mace" },
				{ id: "dagger-held", weaponId: "dagger" },
				...(level >= 5 ? [{ id: "dagger-spare", weaponId: "dagger" as const }] : []),
			],
			hands: { left: "mace", right: "dagger-held" },
		},
		masteredWeaponIds: [],
	};
}
function fixture(level = 1, distance = 20, rolls = [10, 3]) {
	const build = buildLegalCharacter(mixedSelection(level));
	const encounter = new EncounterState([
		combatantInputForBuild(build, "hero"),
		{ id: "target", definition: new BaseMonster("Target", 15, 100), hitPointMode: "inexhaustible" },
	]);
	const roller = new FixedDiceRoller(rolls);
	const selected: AttackSelection[] = [];
	const engine = new CombatEngine(encounter, {
		roller,
		distanceFor: () => distance,
		strategy: {
			useFeature: () => false,
			chooseNextAttack: (_snapshot, candidates) => {
				const first = candidates[0];
				if (!first) return null;
				selected.push(structuredClone(first));
				return 0;
			},
		},
	});
	engine.beginTurn("hero");
	return { build, encounter, roller, engine, selected };
}

test("explicit Thrown mode includes a held Dagger behind an incompatible preferred Mace", () => {
	const f = fixture();
	assert.equal(
		f.engine.isAttackLegal({
			actorId: "hero",
			targetId: "target",
			actionSource: "attack-action",
			weaponInstanceId: "dagger-held",
			mode: "thrown",
		}),
		true,
	);
	const candidates = f.engine.legalAttackCandidates("hero", "target", { mode: "thrown" });
	assert.deepEqual(
		candidates.map(({ weaponInstanceId, mode }) => ({ weaponInstanceId, mode })),
		[{ weaponInstanceId: "dagger-held", mode: "thrown" }],
	);
	assert.equal(f.encounter.canUseAction("hero"), true);
	assert.equal(f.roller.remaining, 2);
	const result = f.engine.resolveAttackAction("hero", "target", { mode: "thrown" });
	assert.equal(result.attacks[0]?.weaponInstanceId, "dagger-held");
	assert.equal(result.totalDamage, 6);
	assert.deepEqual(f.encounter.state("hero").hands, { left: "mace", right: null });
	assert.equal(f.encounter.state("hero").spentWeaponInstanceIds.has("dagger-held"), true);
	assert.equal(f.roller.remaining, 0);
});

test("Thrown Extra Attack uses distinct physical IDs and the second Dagger's valid draw plan", () => {
	const f = fixture(5, 20, [10, 3, 10, 4]);
	const result = f.engine.resolveAttackAction("hero", "target", { mode: "thrown" });
	assert.deepEqual(
		result.attacks.map(({ weaponInstanceId, mode, damage }) => ({
			weaponInstanceId,
			mode,
			damage: damage?.appliedDamage,
		})),
		[
			{ weaponInstanceId: "dagger-held", mode: "thrown", damage: 7 },
			{ weaponInstanceId: "dagger-spare", mode: "thrown", damage: 8 },
		],
	);
	assert.deepEqual(f.selected[1]?.equip, {
		kind: "draw",
		when: "before",
		weaponInstanceId: "dagger-spare",
		hand: "right",
	});
	assert.deepEqual([...f.encounter.state("hero").spentWeaponInstanceIds], ["dagger-held", "dagger-spare"]);
	assert.deepEqual(f.encounter.state("hero").hands, { left: "mace", right: null });
	assert.equal(f.roller.remaining, 0);
});

test("explicit incompatible modes and exhausted Thrown stock never fall back to melee or Unarmed", () => {
	const f = fixture(1, 5, [10, 10, 3]);
	assert.equal(f.engine.legalAttackCandidates("hero", "target", { mode: "ranged" }).length, 0);
	assert.deepEqual(f.engine.resolveAttackAction("hero", "target", { mode: "ranged" }), {
		totalDamage: 0,
		attacks: [],
	});
	assert.equal(f.encounter.canUseAction("hero"), true);
	assert.equal(f.roller.remaining, 3);
	assert.equal(f.engine.resolveAttackAction("hero", "target", { mode: "thrown" }).totalDamage, 6);
	f.engine.endTurn();
	f.engine.beginTurn("hero");
	assert.ok(
		f.engine.legalAttackCandidates("hero", "target", { mode: "melee" }).some((c) => c.weaponInstanceId === "mace"),
	);
	assert.deepEqual(f.engine.resolveAttackAction("hero", "target", { mode: "thrown" }), {
		totalDamage: 0,
		attacks: [],
	});
	assert.equal(f.encounter.canUseAction("hero"), true);
	assert.equal(f.roller.remaining, 0);
});

test("invalid explicit action options reject before costs, RNG or physical stock changes", () => {
	const f = fixture();
	const invalid: readonly { options: AttackActionOptions; message: RegExp }[] = [
		{ options: { mode: "magic" as "melee" }, message: /Invalid attack action mode/ },
		{ options: { distance: Number.NaN }, message: /Invalid attack action distance/ },
		{ options: { weapon: Battleaxe, mode: "thrown" }, message: /Unknown selected weapon/ },
	];
	const before = structuredClone(f.encounter.state("hero"));
	for (const { options, message } of invalid)
		assert.throws(() => f.engine.resolveAttackAction("hero", "target", options), message);
	assert.deepEqual(f.encounter.state("hero"), before);
	assert.equal(f.encounter.canUseAction("hero"), true);
	assert.equal(f.encounter.turn.attackCounts.size, 0);
	assert.equal(f.roller.remaining, 2);
});

test("public legal DPR trial resolves explicit Thrown mode from mixed inventory", () => {
	const roller = new FixedDiceRoller([10, 3]);
	const result = runDprTrial(
		{
			rootSeed: 2024,
			rulesetId: "phb-2024",
			codeVersion: "explicit-mode-regression",
			buildId: "mixed-mace-dagger",
			buildFactory: () => buildLegalCharacter(mixedSelection()),
			strategyId: "held-weapon-only",
			strategyParameters: null,
			strategyFactory: () => ({
				useFeature: () => false,
				useOptionalFeature: () => false,
				chooseFeatureAction: () => null,
				chooseNextAttack: (_snapshot, candidates) => {
					const selected = candidates.findIndex((candidate) => !candidate.equip);
					return selected < 0 ? null : selected;
				},
			}),
			scenario: {
				id: "mixed-thrown",
				episodes: [
					{
						id: "first",
						rounds: 1,
						attack: { kind: "weapon", mode: "thrown" },
						targets: [{ id: "target", armorClass: 15, hitPoints: { mode: "inexhaustible" }, distanceToActor: 20 }],
						initiative: { order: ["hero", "target"] },
					},
				],
			},
		},
		{
			retainAttacks: true,
			combatRandomness: {
				algorithm: "fixed-mode-regression",
				parameters: { rolls: [10, 3] },
				createRoller: () => roller,
			},
		},
	);
	assert.equal(result.appliedDamage, 6);
	assert.equal(result.dpr, 6);
	assert.equal(result.weaponInstancesSpent, 1);
	assert.equal(result.episodes[0]?.attacks?.[0]?.weaponInstanceId, "dagger-held");
	assert.equal(result.episodes[0]?.attacks?.[0]?.mode, "thrown");
	assert.equal(roller.remaining, 0);
});
