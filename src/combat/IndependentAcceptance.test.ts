import assert from "node:assert/strict";
import test from "node:test";
import BaseCharacter, { defaultStatBlock } from "../character/BaseCharacter.ts";
import { abilityNames } from "../character/CombatantData.ts";
import BaseClass from "../classes/BaseClass.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { EFeatName } from "../feats/Feats.ts";
import {
	Battleaxe,
	Dagger,
	Greataxe,
	Greatsword,
	Handaxe,
	Longsword,
	Pistol,
	Whip,
} from "../Items/Weapon/WeaponList.ts";
import type Weapon from "../Items/Weapon.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { createProbabilisticCleaveProvider } from "../scenarios/Cleave.ts";
import { CombatEngine } from "./AttackResolver.ts";
import type { AttackSelection, CombatantInput, CombatEngineOptions } from "./CombatTypes.ts";
import type { DamageComponent } from "./DamageTypes.ts";
import { EncounterState } from "./EncounterState.ts";

// Independent P0 oracles: .agents/reports/2024-combat-acceptance-cases.md.
// Sources: Basic Rules 2024 Playing the Game/Equipment/Glossary; SRD5.2.1
// pp.17–18; PHB errata v2.0 Stabilizing; verified 2026-10-08.
class AcceptanceClass extends BaseClass {
	override getAttackCount(): number {
		return 2;
	}
	override getWeaponMasteryCount(): number {
		return 38;
	}
	override canUseWeaponMastery(): boolean {
		return true;
	}
}
function component(
	id: string,
	amount: number,
	damageType: DamageComponent["damageType"] = "slashing",
): DamageComponent {
	return {
		id,
		source: "acceptance.fixed",
		origin: "other",
		damageType,
		dice: [],
		flatBonus: amount,
		doublesOnCrit: false,
	};
}
function synthetic(targetId: string, amount: number): AttackSelection {
	return { targetId, mode: "melee", distance: 5, profile: { attackBonus: 10, damage: [component("fixed", amount)] } };
}
function make(
	inputs: readonly CombatantInput[],
	rolls: readonly number[],
	options: Omit<CombatEngineOptions, "roller"> = {},
) {
	const encounter = new EncounterState(inputs);
	const roller = new FixedDiceRoller(rolls);
	const engine = new CombatEngine(encounter, { ...options, roller });
	return { encounter, roller, engine };
}
function weaponFixture(
	weapon: Weapon,
	rolls: readonly number[],
	options: Omit<CombatEngineOptions, "roller"> = {},
	mastery = true,
) {
	const actor = new BaseCharacter(
		4,
		new AcceptanceClass([weapon]),
		weapon,
		"strength",
		{ ...defaultStatBlock, strength: 16 },
		16,
		30,
	);
	return make(
		[
			{
				id: "hero",
				definition: actor,
				weapons: [{ id: "main", weapon }],
				initialHands: { left: "main", right: null },
				masteredWeaponNames: mastery ? [weapon.name] : [],
			},
			{ id: "first", definition: new BaseMonster("First", 12, 40) },
			{ id: "second", definition: new BaseMonster("Second", 12, 40) },
		],
		rolls,
		options,
	);
}
function weaponSelection(targetId = "first"): AttackSelection {
	return { targetId, weaponInstanceId: "main", mode: "melee", distance: 5 };
}

test("independent T01–04: scheduler opens six boundaries, rounds and manual separation", () => {
	const f = make(
		["a", "b", "c"].map((id) => ({ id, definition: new BaseMonster(id, 10, 20) })),
		[],
	);
	const scheduler = f.engine.createScheduler({ order: ["a", "b", "c"] });
	const owners: string[] = [];
	const rounds: number[] = [];
	const turns: number[] = [];
	assert.throws(() => f.engine.beginTurn("a"));
	for (let i = 0; i < 6; i++) {
		const start = scheduler.beginNextTurn();
		owners.push(start.ownerId);
		rounds.push(start.roundNumber);
		turns.push(start.turnId);
		assert.throws(() => scheduler.beginNextTurn());
		scheduler.endTurn();
	}
	assert.deepEqual(owners, ["a", "b", "c", "a", "b", "c"]);
	assert.deepEqual(rounds, [1, 1, 1, 2, 2, 2]);
	assert.deepEqual(turns, [1, 2, 3, 4, 5, 6]);
	assert.equal(f.roller.remaining, 0);
});
test("independent T02: initiative uses actual Dexterity and exactly one d20 each", () => {
	const f = make(
		[
			["a", 14],
			["b", 10],
			["c", 16],
		].map(([id, dex]) => ({
			id: String(id),
			definition: new BaseMonster(String(id), 10, 20, 30, { stats: { ...defaultStatBlock, dexterity: Number(dex) } }),
		})),
		[10, 15, 7],
	);
	const scheduler = f.engine.createScheduler();
	assert.deepEqual(scheduler.order, ["b", "a", "c"]);
	assert.deepEqual(
		scheduler.initiative.map((r) => r.total),
		[12, 15, 10],
	);
	assert.equal(f.roller.remaining, 0);
});
test("independent S01–04: six saves, equality, ordinary natural1/20 and no-dice failure", () => {
	const monster = new BaseMonster("Saver", 10, 20, 30, {
		stats: Object.fromEntries(abilityNames.map((a) => [a, 14])) as typeof defaultStatBlock,
		savingThrowProficiencies: abilityNames,
		proficiencyBonus: 3,
	});
	const f = make([{ id: "target", definition: monster }], Array(6).fill(9));
	for (const ability of abilityNames) {
		const result = f.engine.resolveSavingThrow({ targetId: "target", ability, dc: 15, source: "acceptance", bonus: 1 });
		assert.equal(result.total, 15);
		assert.equal(result.success, true);
	}
	assert.equal(f.roller.remaining, 0);
	const ordinary = make(
		[
			{ id: "high", definition: new BaseMonster("High", 10, 20, 30, { savingThrowBonuses: { wisdom: 20 } }) },
			{ id: "normal", definition: new BaseMonster("Normal", 10, 20) },
		],
		[1, 20],
	);
	assert.equal(
		ordinary.engine.resolveSavingThrow({ targetId: "high", ability: "wisdom", dc: 21, source: "acceptance" }).success,
		true,
	);
	assert.equal(
		ordinary.engine.resolveSavingThrow({ targetId: "normal", ability: "wisdom", dc: 21, source: "acceptance" }).success,
		false,
	);
	ordinary.encounter.state("normal").conditions.push({ name: "paralyzed" });
	assert.equal(
		ordinary.engine.resolveSavingThrow({ targetId: "normal", ability: "dexterity", dc: 10, source: "acceptance" })
			.outcome,
		"automatic-failure",
	);
	assert.equal(
		ordinary.engine.resolveSavingThrow({
			targetId: "high",
			ability: "constitution",
			dc: 10,
			source: "acceptance",
			voluntaryFailure: true,
		}).outcome,
		"voluntary-failure",
	);
	assert.equal(ordinary.roller.remaining, 0);
});
test("independent D01–04: engine aggregates types before defenses and separates tempHP from loss", () => {
	const f = make(
		[
			{ id: "actor", definition: new BaseMonster("Actor", 10, 20) },
			{
				id: "target",
				definition: new BaseMonster("Target", 10, 20, 30, {
					defenses: { resistances: ["slashing"], vulnerabilities: ["fire"] },
				}),
				initialTemporaryHp: 5,
			},
		],
		[10],
	);
	f.engine.beginTurn("actor");
	const result = f.engine.resolveSingleAttack({
		actorId: "actor",
		targetId: "target",
		actionSource: "attack-action",
		mode: "melee",
		profile: { attackBonus: 0, damage: [component("s1", 3), component("s2", 3), component("fire", 5, "fire")] },
	});
	assert.deepEqual(result.damage?.byType, { slashing: 6, fire: 5 });
	assert.deepEqual(result.damage?.appliedByType, { slashing: 3, fire: 10 });
	assert.equal(result.damage?.rolledDamage, 11);
	assert.equal(result.damage?.appliedDamage, 13);
	assert.equal(result.damage?.hp.temporaryHpLost, 5);
	assert.equal(result.damage?.hp.hpLost, 8);
	assert.equal(f.encounter.state("target").hitPoints, 12);
});
test("independent H02–04: engine lifecycle rolls deathsaves once, stabilizes and keeps Prone on healing", () => {
	const f = make(
		[
			{
				id: "target",
				definition: new BaseMonster("Target", 10, 12),
				initialHitPoints: 0,
				zeroHpBehavior: "death-saves",
			},
			{ id: "other", definition: new BaseMonster("Other", 10, 12) },
		],
		[10, 15, 19],
	);
	for (let i = 0; i < 3; i++) {
		const start = f.engine.beginTurn("target");
		assert.equal(start.deathSave?.success, true);
		assert.throws(() => f.engine.beginTurn("target"));
		f.engine.endTurn();
		f.engine.beginTurn("other");
		f.engine.endTurn();
	}
	assert.equal(f.encounter.state("target").lifeState, "stable");
	assert.deepEqual(f.encounter.state("target").deathSaves, { successes: 0, failures: 0 });
	assert.equal(f.engine.beginTurn("target").deathSave, undefined);
	f.engine.endTurn();
	f.engine.grantTemporaryHp("target", 5, true);
	assert.equal(f.encounter.state("target").lifeState, "stable");
	assert.equal(f.encounter.state("target").hitPoints, 0);
	assert.equal(f.engine.heal("target", 1).currentLifeState, "alive");
	assert.ok(f.encounter.state("target").conditions.some((c) => c.name === "prone"));
	assert.ok(!f.encounter.state("target").conditions.some((c) => c.name === "unconscious"));
	assert.equal(f.roller.remaining, 0);
});
test("independent H05: attack critical metadata reaches damage-at-zero despite tempHP", () => {
	const f = make(
		[
			{ id: "actor", definition: new BaseMonster("Actor", 10, 20) },
			{
				id: "target",
				definition: new BaseMonster("Target", 10, 12),
				initialHitPoints: 0,
				initialTemporaryHp: 5,
				zeroHpBehavior: "death-saves",
			},
		],
		[20, 10],
	);
	f.engine.beginTurn("actor");
	const result = f.engine.resolveSingleAttack({
		actorId: "actor",
		actionSource: "attack-action",
		...synthetic("target", 1),
	});
	assert.equal(result.hit.isCrit, true);
	assert.equal(result.damage?.hp.hpLost, 0);
	assert.equal(result.damage?.hp.temporaryHpLost, 1);
	assert.equal(result.damage?.hp.currentDeathSaves.failures, 2);
	assert.equal(result.damage?.hp.reducedToZero, false);
});
test("independent H08: stabilization equality spends Action, out-of-range rejects atomically", () => {
	const f = make(
		[
			{
				id: "helper",
				definition: new BaseMonster("Helper", 10, 20, 30, { stats: { ...defaultStatBlock, wisdom: 14 } }),
			},
			{
				id: "target",
				definition: new BaseMonster("Target", 10, 12),
				initialHitPoints: 0,
				zeroHpBehavior: "death-saves",
			},
		],
		[8],
	);
	f.engine.beginTurn("helper");
	const before = structuredClone(f.encounter.state("target"));
	assert.throws(() => f.engine.stabilize("helper", "target", { distance: 5.01 }));
	assert.equal(f.roller.remaining, 1);
	assert.equal(f.encounter.canUseAction("helper"), true);
	assert.deepEqual(f.encounter.state("target"), before);
	assert.equal(f.engine.stabilize("helper", "target", { distance: 5 }).total, 10);
	assert.equal(f.encounter.state("target").lifeState, "stable");
	assert.equal(f.encounter.canUseAction("helper"), false);
	assert.equal(f.encounter.canUseBonusAction("helper"), true);
	assert.equal(f.roller.remaining, 0);
});
test("independent M01/W02: real Graze has selected mastery, no bonus pollution, defenses", () => {
	const f = weaponFixture(Greatsword, [1], {
		hooks: [{ id: "acceptance.extra", damageComponents: () => [component("extra", 100)] }],
	});
	f.engine.beginTurn("hero");
	const result = f.engine.resolveSingleAttack({ actorId: "hero", actionSource: "attack-action", ...weaponSelection() });
	assert.equal(result.hit.isHit, false);
	assert.equal(result.damage?.rolledDamage, 3);
	assert.equal(f.encounter.state("first").hitPoints, 37);
	assert.equal(f.roller.remaining, 0);
	const unselected = weaponFixture(Greatsword, [1], {}, false);
	unselected.engine.beginTurn("hero");
	const miss = unselected.engine.resolveSingleAttack({
		actorId: "hero",
		actionSource: "attack-action",
		...weaponSelection(),
	});
	assert.equal(miss.damage, undefined);
	assert.equal(unselected.encounter.state("first").hitPoints, 40);
});
test("independent M04/T12: Sap zero-damage hit survives invalid request, consumed by victim roll", () => {
	const f = weaponFixture(Longsword, [10, 1, 4, 16]);
	// Replace the target before encounter creation to preserve passive definitions.
	const actor = f.encounter.definition("hero");
	const g = make(
		[
			{
				id: "hero",
				definition: actor,
				weapons: [{ id: "main", weapon: Longsword }],
				initialHands: { left: "main", right: null },
				masteredWeaponNames: ["Longsword"],
			},
			{ id: "first", definition: new BaseMonster("Immune", 12, 40, 30, { defenses: { immunities: ["slashing"] } }) },
			{ id: "second", definition: new BaseMonster("Second", 12, 40) },
		],
		[10, 1, 4, 16],
	);
	g.engine.beginTurn("hero");
	const hit = g.engine.resolveSingleAttack({ actorId: "hero", actionSource: "attack-action", ...weaponSelection() });
	assert.equal(hit.damage?.appliedDamage, 0);
	assert.equal(g.encounter.hasAttackDisadvantage("first"), true);
	g.engine.endTurn();
	g.engine.beginTurn("first");
	const state = structuredClone(g.encounter.state("first"));
	assert.throws(() =>
		g.engine.resolveSingleAttack({
			actorId: "first",
			actionSource: "attack-action",
			...synthetic("second", 1),
			distance: Number.NaN,
		}),
	);
	assert.equal(g.roller.remaining, 2);
	assert.deepEqual(g.encounter.state("first"), state);
	assert.equal(g.encounter.canUseAction("first"), true);
	assert.equal(g.encounter.hasAttackDisadvantage("first"), true);
	const attack = g.engine.resolveSingleAttack({
		actorId: "first",
		actionSource: "attack-action",
		...synthetic("second", 1),
	});
	assert.deepEqual(attack.hit.d20Rolls, [4, 16]);
	assert.equal(attack.hit.d20Roll, 4);
	assert.equal(g.encounter.hasAttackDisadvantage("first"), false);
	assert.equal(g.roller.remaining, 0);
});
test("independent M05: Slow requires damageTaken even if all absorbed, and expires source start", () => {
	const f = weaponFixture(Whip, [10, 1]);
	f.engine.grantTemporaryHp("first", 10, true);
	f.engine.beginTurn("hero");
	const hit = f.engine.resolveSingleAttack({ actorId: "hero", actionSource: "attack-action", ...weaponSelection() });
	assert.equal(hit.damage?.hp.hpLost, 0);
	assert.equal(hit.damage?.hp.damageTaken, 4);
	assert.equal(f.encounter.effectiveSpeed("first"), 20);
	f.engine.endTurn();
	f.engine.beginTurn("second");
	assert.equal(f.encounter.effectiveSpeed("first"), 20);
	f.engine.endTurn();
	f.engine.beginTurn("hero");
	assert.equal(f.encounter.effectiveSpeed("first"), 30);
});
test("independent M06: Vex skips other targets and applies matching roll before consumption", () => {
	const f = weaponFixture(Handaxe, [10, 1, 10, 1, 1, 18, 1]);
	f.engine.beginTurn("hero");
	const action = f.engine.beginAttackAction("hero");
	f.engine.attackInAction(action, weaponSelection());
	f.engine.attackInAction(action, weaponSelection("second"));
	f.engine.finishAttackAction(action);
	f.engine.endTurn();
	f.engine.beginTurn("hero");
	const result = f.engine.resolveSingleAttack({ actorId: "hero", actionSource: "attack-action", ...weaponSelection() });
	assert.deepEqual(result.hit.d20Rolls, [1, 18]);
	assert.equal(result.hit.isHit, true);
	assert.equal(f.roller.remaining, 0);
});
test("independent M07: Topple DC13 fail12 yields Prone advantage on following primary", () => {
	let toppleChoices = 0;
	const f = weaponFixture(Battleaxe, [10, 1, 12, 4, 16, 1], {
		strategy: { useFeature: (_s, id) => id !== "weaponMastery.topple" || toppleChoices++ === 0 },
	});
	f.engine.beginTurn("hero");
	const action = f.engine.beginAttackAction("hero");
	const first = f.engine.attackInAction(action, weaponSelection());
	assert.equal(first.savingThrows?.[0]?.dc, 13);
	assert.equal(first.savingThrows?.[0]?.total, 12);
	assert.equal(first.savingThrows?.[0]?.success, false);
	assert.ok(f.encounter.state("first").conditions.some((c) => c.name === "prone"));
	const second = f.engine.attackInAction(action, weaponSelection());
	assert.deepEqual(second.hit.d20Rolls, [4, 16]);
	assert.equal(second.savingThrows, undefined);
	assert.equal(f.roller.remaining, 0);
});
test("independent W07/T07: Loading cannot be bypassed with string actionId and rejects without cost", () => {
	const f = weaponFixture(Pistol, [10, 4, 10], {}, false);
	f.engine.beginTurn("hero");
	const action = f.engine.beginAttackAction("hero");
	const selection: AttackSelection = { targetId: "first", weaponInstanceId: "main", mode: "ranged", distance: 5 };
	f.engine.attackInAction(action, selection);
	const before = structuredClone(f.encounter.state("hero"));
	const hp = f.encounter.state("first").hitPoints;
	assert.throws(() =>
		f.engine.resolveSingleAttack({
			actorId: "hero",
			actionSource: "attack-action",
			action,
			actionId: "forged-fresh-action",
			...selection,
		}),
	);
	assert.equal(f.roller.remaining, 1);
	assert.equal(f.encounter.state("first").hitPoints, hp);
	assert.deepEqual(f.encounter.state("hero"), before);
});

test("independent M02–03: Nick has one Light slot without positive ability bonus or Bonus Action cost", () => {
	for (const strength of [16, 8]) {
		const actor = new BaseCharacter(
			4,
			new AcceptanceClass([Handaxe, Dagger]),
			Handaxe,
			"strength",
			{ ...defaultStatBlock, strength },
			16,
			30,
		);
		const f = make(
			[
				{
					id: "hero",
					definition: actor,
					weapons: [
						{ id: "main", weapon: Handaxe },
						{ id: "off", weapon: Dagger },
					],
					initialHands: { left: "main", right: "off" },
					masteredWeaponNames: ["Dagger"],
				},
				{ id: "first", definition: new BaseMonster("First", 12, 40) },
				{ id: "second", definition: new BaseMonster("Second", 12, 40) },
			],
			[12, 4, 12, 2, 12, 1],
		);
		f.engine.beginTurn("hero");
		const action = f.engine.beginAttackAction("hero");
		f.engine.attackInAction(action, weaponSelection());
		const nick = f.engine.resolveLightAttack(
			"hero",
			{ targetId: "first", weaponInstanceId: "off", mode: "melee", distance: 5 },
			{ useNick: true },
		);
		assert.equal(nick.attackOrigin, "nick");
		assert.equal(nick.actionSource, "attack-action");
		assert.equal(nick.damage?.rolledDamage, strength === 16 ? 2 : 1);
		assert.equal(f.encounter.canUseBonusAction("hero"), true);
		const remaining = f.roller.remaining;
		assert.throws(() =>
			f.engine.resolveLightAttack("hero", { targetId: "first", weaponInstanceId: "off", mode: "melee", distance: 5 }),
		);
		assert.equal(f.roller.remaining, remaining);
		const primary = f.engine.attackInAction(action, weaponSelection("second"));
		assert.equal(primary.attackOrigin, "primary");
		assert.equal(primary.damage?.rolledDamage, strength === 16 ? 4 : 0);
		f.engine.finishAttackAction(action);
		assert.equal(f.roller.remaining, 0);
	}
});

test("independent M08/M12: simultaneous Cleave/Hew respect lineage, chosen order and concrete HP", () => {
	for (const reverse of [false, true]) {
		const actor = new BaseCharacter(
			4,
			new AcceptanceClass([Greataxe]),
			Greataxe,
			"strength",
			{ ...defaultStatBlock, strength: 16 },
			16,
			30,
			[{ name: EFeatName.GREAT_WEAPON_MASTER, abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] }],
		);
		const f = make(
			[
				{ id: "hero", definition: actor, masteredWeaponNames: ["Greataxe"] },
				{ id: "first", definition: new BaseMonster("First", 12, 40) },
				{ id: "second", definition: new BaseMonster("Second", 12, 40) },
			],
			[20, 5, 6, 10, 4, 10, 3],
			{
				cleaveCandidates: () => [{ targetId: "second", distanceToActor: 5, distanceToPrimary: 5 }],
				strategy: {
					useFeature: (snapshot, id) => id !== "weaponMastery.cleave" || snapshot.actionSource === "attack-action",
					chooseHewTarget: (_snapshot, targets) => (targets.some((t) => t.id === "second") ? "second" : null),
					orderTriggers: (_snapshot, ids) => (reverse ? [...ids].reverse() : [...ids]),
				},
				distanceFor: () => 5,
			},
		);
		f.engine.beginTurn("hero");
		const result = f.engine.resolveSingleAttack({
			actorId: "hero",
			targetId: "first",
			actionSource: "attack-action",
			mode: "melee",
			distance: 5,
		});
		assert.equal(result.damage?.rolledDamage, 16);
		assert.deepEqual(
			result.triggeredAttacks.map((a) => a.attackOrigin),
			reverse ? ["hew", "cleave"] : ["cleave", "hew"],
		);
		const cleave = result.triggeredAttacks.find((a) => a.attackOrigin === "cleave");
		const hew = result.triggeredAttacks.find((a) => a.attackOrigin === "hew");
		assert.equal(cleave?.actionSource, "attack-action");
		assert.equal(cleave?.actionId, result.actionId);
		assert.equal(cleave?.damage?.rolledDamage, reverse ? 5 : 6);
		assert.equal(hew?.damage?.rolledDamage, reverse ? 7 : 6);
		assert.equal(hew?.actionSource, "bonus-action");
		assert.equal(f.encounter.state("second").hitPoints, 28);
		assert.equal(f.encounter.canUseBonusAction("hero"), false);
		assert.equal(f.roller.remaining, 0);
	}
});

test("independent M09–10: Cleave samples once after eligible hit, refusal caches and real secondary takes damage", () => {
	let environmentCalls = 0;
	const samples = [0.25, 0.75];
	const provider = createProbabilisticCleaveProvider({
		probability: 0.5,
		candidate: { targetId: "second", distanceToActor: 5, distanceToPrimary: 5 },
		random: () => {
			const sample = samples[environmentCalls++];
			assert.notEqual(sample, undefined);
			return sample ?? 0;
		},
	});
	let cleaveChoices = 0;
	const f = weaponFixture(Greataxe, [1, 10, 5, 10, 6, 10, 4, 10, 1, 10, 2], {
		cleaveCandidates: provider.candidates,
		strategy: { useFeature: (_snapshot, id) => id !== "weaponMastery.cleave" || cleaveChoices++ > 0 },
	});
	f.engine.beginTurn("hero");
	f.engine.resolveSingleAttack({ actorId: "hero", actionSource: "attack-action", ...weaponSelection() });
	assert.equal(environmentCalls, 0, "miss does not sample environment");
	f.engine.endTurn();
	f.engine.beginTurn("hero");
	const action = f.engine.beginAttackAction("hero");
	const first = f.engine.attackInAction(action, weaponSelection());
	assert.equal(first.triggeredAttacks.length, 0);
	assert.equal(environmentCalls, 1);
	assert.equal(f.encounter.hasUsed("hero", "weaponMastery.cleave"), false);
	const second = f.engine.attackInAction(action, weaponSelection());
	assert.equal(second.triggeredAttacks[0]?.damage?.rolledDamage, 4);
	assert.equal(f.encounter.state("second").hitPoints, 36);
	assert.equal(environmentCalls, 1);
	f.engine.finishAttackAction(action);
	f.engine.endTurn();
	f.engine.beginTurn("hero");
	const next = f.engine.resolveAttackAction("hero", "first");
	assert.equal(next.attacks.flatMap((a) => a.triggeredAttacks).length, 0);
	assert.equal(environmentCalls, 2);
	assert.equal(provider.decisions.length, 2);
	assert.equal(f.roller.remaining, 0);
});

test("independent M10: p0/p1 do not sample environment and preserve separate battle draws", () => {
	for (const probability of [0, 1]) {
		const provider = createProbabilisticCleaveProvider({
			probability,
			candidate: { targetId: "second", distanceToActor: 5, distanceToPrimary: 5 },
			random: () => {
				throw new Error("endpoint must not draw environment");
			},
		});
		const f = weaponFixture(Greataxe, probability === 0 ? [10, 5] : [10, 5, 10, 4], {
			cleaveCandidates: provider.candidates,
		});
		f.engine.beginTurn("hero");
		const result = f.engine.resolveSingleAttack({
			actorId: "hero",
			actionSource: "attack-action",
			...weaponSelection(),
		});
		assert.equal(result.damage?.rolledDamage, 8);
		assert.equal(f.encounter.state("first").hitPoints, 32);
		assert.equal(f.encounter.state("second").hitPoints, probability === 0 ? 40 : 36);
		assert.equal(result.triggeredAttacks.length, probability);
		assert.equal(f.roller.remaining, 0);
	}
});

test("independent T10: strategy receives frozen legal choices, selects new weapon/target after first HP result", () => {
	const actor = new BaseCharacter(
		4,
		new AcceptanceClass([Longsword, Dagger]),
		Longsword,
		"strength",
		{ ...defaultStatBlock, strength: 16 },
		16,
		30,
	);
	const secondTarget = new BaseMonster("Second", 12, 40);
	secondTarget.addCondition({ name: "exhaustion", level: 1 });
	let choices = 0;
	const f = make(
		[
			{
				id: "hero",
				definition: actor,
				weapons: [
					{ id: "main", weapon: Longsword },
					{ id: "off", weapon: Dagger },
				],
				initialHands: { left: "main", right: "off" },
			},
			{ id: "first", definition: new BaseMonster("First", 12, 40) },
			{ id: "second", definition: secondTarget },
		],
		[10, 4, 10, 2],
		{
			strategy: {
				chooseNextAttack: (snapshot, candidates) => {
					assert.equal(Object.isFrozen(snapshot), true);
					assert.equal(Object.isFrozen(snapshot.actor), true);
					assert.equal(Object.isFrozen(snapshot.targets), true);
					const visibleCondition = snapshot.targets.find((target) => target.id === "second")?.conditions?.[0];
					assert.equal(visibleCondition?.name, "exhaustion");
					assert.ok(visibleCondition && Object.isFrozen(visibleCondition));
					if (visibleCondition) assert.equal(Reflect.set(visibleCondition, "name", "prone"), false);
					assert.equal(Object.isFrozen(candidates), true);
					assert.ok(candidates.every((c) => Object.isFrozen(c)));
					assert.equal("roller" in snapshot, false);
					assert.equal("encounter" in snapshot, false);
					if (choices++ === 0)
						return candidates.findIndex(
							(c) => c.targetId === "first" && c.weaponInstanceId === "main" && c.attackOrigin === "primary",
						);
					if (choices === 2) {
						assert.equal(snapshot.targets.find((target) => target.id === "first")?.hitPoints, 33);
						return candidates.findIndex(
							(c) => c.targetId === "second" && c.weaponInstanceId === "off" && c.attackOrigin === "primary",
						);
					}
					return null;
				},
			},
		},
	);
	f.engine.beginTurn("hero");
	const result = f.engine.resolveAttackAction("hero", "first");
	assert.deepEqual(
		result.attacks.map((a) => a.targetId),
		["first", "second"],
	);
	assert.deepEqual(
		result.attacks.map((a) => a.weapon?.name),
		["Longsword", "Dagger"],
	);
	assert.equal(f.encounter.state("first").hitPoints, 33);
	assert.equal(f.encounter.state("second").hitPoints, 35);
	assert.equal(f.encounter.state("second").conditions[0]?.name, "exhaustion");
	assert.equal(Object.isFrozen(f.encounter.state("second").conditions[0]), false);
	assert.equal(f.roller.remaining, 0);
});

test("independent T12: invalid first strategy choice leaves Action, dice and attack effects unchanged", () => {
	const f = weaponFixture(Longsword, [10, 1], { strategy: { chooseNextAttack: () => -1 } });
	f.engine.beginTurn("hero");
	f.encounter.addEffect({
		kind: "acceptance.sap",
		sourceId: "second",
		targetId: "hero",
		expires: "start-of-source-next-turn",
		attackDisadvantage: true,
		consumeOnAttack: { actorId: "hero" },
	});
	const before = structuredClone(f.encounter.state("hero"));
	const effects = structuredClone(f.encounter.effectsOn("hero"));
	assert.throws(() => f.engine.resolveAttackAction("hero", "first"));
	assert.equal(f.encounter.canUseAction("hero"), true);
	assert.equal(f.encounter.canUseBonusAction("hero"), true);
	assert.equal(f.roller.remaining, 2);
	assert.deepEqual(f.encounter.state("hero"), before);
	assert.deepEqual(f.encounter.effectsOn("hero"), effects);
});

test("independent T02–03: initiative conditions cancel correctly and invalid order draws no dice", () => {
	const a = new BaseMonster("A", 10, 20, 30, { stats: { ...defaultStatBlock, dexterity: 14 } });
	a.addCondition({ name: "invisible" });
	a.addCondition({ name: "exhaustion", level: 2 });
	const b = new BaseMonster("B", 10, 20);
	b.addCondition({ name: "incapacitated" });
	const c = new BaseMonster("C", 10, 20);
	c.addCondition({ name: "invisible" });
	const f = make(
		[
			{ id: "a", definition: a },
			{ id: "b", definition: b },
			{ id: "c", definition: c },
		],
		[10, 18, 3, 4, 16],
	);
	assert.throws(() => f.engine.createScheduler({ order: ["a", "a", "c"] }));
	assert.equal(f.roller.remaining, 5);
	const scheduler = f.engine.createScheduler({ surprisedIds: ["a"] });
	assert.deepEqual(scheduler.order, ["c", "a", "b"]);
	assert.deepEqual(
		scheduler.initiative.map((r) => r.total),
		[8, 3, 16],
	);
	assert.deepEqual(
		scheduler.initiative.map((r) => r.d20Rolls),
		[[10], [18, 3], [4, 16]],
	);
	assert.equal(f.roller.remaining, 0);
});
