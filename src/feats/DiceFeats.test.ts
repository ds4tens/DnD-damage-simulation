import assert from "node:assert/strict";
import { test } from "node:test";
import BaseCharacter from "../character/BaseCharacter.ts";
import BaseClass from "../classes/BaseClass.ts";
import { CombatEngine } from "../combat/AttackResolver.ts";
import type { AttackRequest, CombatHook } from "../combat/CombatTypes.ts";
import { allDamageDice } from "../combat/DamageResolver.ts";
import type { DamageComponent, DamagePool } from "../combat/DamageTypes.ts";
import { EncounterState } from "../combat/EncounterState.ts";
import type { CombatStrategy } from "../combat/Strategy.ts";
import Dice from "../dice/dice.ts";
import { FixedDiceRoller, type FixedRoll } from "../dice/RandomSource.ts";
import Weapon from "../Items/Weapon.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { EFeatName } from "./Feats.ts";
import { piercerHook } from "./Piercer.ts";
import { savageAttackerHook } from "./SavageAttacker.ts";

const spear = new Weapon("Spear", "", "simple", "common", 1, 1, "medium", [new Dice(8)], "piercing");
const greatsword = new Weapon(
	"Greatsword",
	"",
	"martial",
	"common",
	1,
	1,
	"medium",
	[new Dice(6), new Dice(6)],
	"slashing",
);
const bow = new Weapon("Bow", "", "martial", "common", 1, 1, "medium", [new Dice(8)], "piercing", undefined, {
	category: "ranged",
	range: { normal: 80, long: 320 },
});
function component(overrides: Partial<DamageComponent> = {}): DamageComponent {
	return {
		id: "extra",
		source: "test",
		origin: "class",
		damageType: "fire",
		dice: [6],
		flatBonus: 0,
		doublesOnCrit: true,
		...overrides,
	};
}
function fixture(
	rolls: FixedRoll[],
	options: {
		weapon?: Weapon;
		hooks?: CombatHook[];
		strategy?: Partial<CombatStrategy>;
	} = {},
) {
	const weapon = options.weapon ?? spear;
	const hooks = options.hooks ?? [savageAttackerHook, piercerHook];
	const hero = new BaseCharacter(
		4,
		new BaseClass([weapon]),
		weapon,
		"strength",
		{
			strength: 16,
			dexterity: 10,
			constitution: 10,
			intelligence: 10,
			wisdom: 10,
			charisma: 10,
		},
		16,
		100,
		hooks.flatMap((hook) =>
			hook.featName
				? [
						{
							name: hook.featName,
							...(hook.featName === "savage-attacker"
								? {}
								: { abilityScoreImprovement: [{ abilityScore: "dexterity" as const, amount: 1 }] }),
							type: hook.featName === EFeatName.SAVAGE_ATTACKER ? ("origin" as const) : ("general" as const),
						},
					]
				: [],
		),
	);
	const encounter = new EncounterState([
		{ id: "hero", definition: hero },
		{ id: "enemy", definition: new BaseMonster("Target", 10, 1000) },
	]);
	const roller = new FixedDiceRoller(rolls);
	const engine = new CombatEngine(encounter, {
		roller,
		hooks,
		...(options.strategy ? { strategy: options.strategy } : {}),
	});
	encounter.beginTurn("hero");
	const request: AttackRequest = {
		actorId: "hero",
		targetId: "enemy",
		mode: weapon.category === "ranged" ? "ranged" : "melee",
		actionSource: "attack-action",
	};
	return { encounter, engine, roller, request, hero };
}
function pool(result: ReturnType<CombatEngine["resolveSingleAttack"]>): DamagePool {
	assert.ok(result.damage);
	return result.damage.components;
}

test("Savage Attacker chooses one entire 2d6 pool, preserving flat bonuses", () => {
	const f = fixture([10, 6, 1, 3, 3], { weapon: greatsword, hooks: [savageAttackerHook] });
	const result = f.engine.resolveSingleAttack(f.request);
	assert.equal(result.damage?.rolledDamage, 10);
	assert.deepEqual(
		allDamageDice(pool(result)).map((die) => die.value),
		[6, 1],
	);
	assert.equal(f.roller.remaining, 0);
	assert.equal(f.encounter.hasUsed("hero", "savage-attacker"), true);
});
test("Savage Attacker compares complete critical pools and excludes class dice from candidates", () => {
	let candidatesSeen = false;
	const extra: CombatHook = { id: "extra", damageComponents: () => [component()] };
	const f = fixture([20, 6, 1, 1, 1, 3, 3, 3, 3, 5, 6], {
		weapon: greatsword,
		hooks: [savageAttackerHook, extra],
		strategy: {
			chooseWeaponRoll: (_snapshot, candidates) => {
				assert.deepEqual(
					candidates.map((candidate) => allDamageDice(candidate).map((die) => die.value)),
					[
						[6, 1, 1, 1],
						[3, 3, 3, 3],
					],
				);
				assert.ok(candidates.every((candidate) => candidate.every((entry) => entry.origin === "weapon")));
				candidatesSeen = true;
				return 1;
			},
		},
	});
	const result = f.engine.resolveSingleAttack(f.request);
	assert.equal(result.damage?.rolledDamage, 26);
	assert.equal(candidatesSeen, true);
	assert.deepEqual(
		allDamageDice(pool(result)).map((die) => die.provenance),
		["base", "critical-copy", "base", "critical-copy", "base", "critical-copy"],
	);
	assert.equal(f.roller.remaining, 0);
});
test("Savage Attacker supports ranged attacks, excluding unarmed and flat-only weapon pools", () => {
	const ranged = fixture([10, 2, 7], { weapon: bow, hooks: [savageAttackerHook] });
	assert.equal(ranged.engine.resolveSingleAttack(ranged.request).damage?.rolledDamage, 10);
	for (const origin of ["unarmed", "weapon"] as const) {
		const f = fixture(origin === "unarmed" ? [10, 2] : [10], { hooks: [savageAttackerHook] });
		const result = f.engine.resolveSingleAttack({
			...f.request,
			...(origin === "weapon" ? { weapon: spear } : {}),
			profile: {
				attackBonus: 5,
				damage: [component({ origin, dice: origin === "unarmed" ? [6] : [], damageType: "bludgeoning", flatBonus: 3 })],
			},
		});
		assert.equal(result.damage?.rolledDamage, origin === "unarmed" ? 5 : 3);
		assert.equal(f.encounter.hasUsed("hero", "savage-attacker"), false);
		assert.equal(f.roller.remaining, 0);
	}
});
test("Savage Attacker miss and refusal preserve use; applying once spans separate calls", () => {
	let accept = false;
	const f = fixture([1, 10, 2, 10, 3, 7, 10, 4], {
		hooks: [savageAttackerHook],
		strategy: { useFeature: () => accept },
	});
	assert.equal(f.engine.resolveSingleAttack(f.request).hit.isHit, false);
	assert.equal(f.engine.resolveSingleAttack(f.request).damage?.rolledDamage, 5);
	assert.equal(f.encounter.hasUsed("hero", "savage-attacker"), false);
	accept = true;
	assert.equal(f.engine.resolveSingleAttack(f.request).damage?.rolledDamage, 10);
	assert.equal(f.engine.resolveSingleAttack(f.request).damage?.rolledDamage, 7);
	assert.equal(f.roller.remaining, 0);
});

test("Puncture accepts the new result even when worse", () => {
	const f = fixture([10, 7, 1], {
		hooks: [piercerHook],
		strategy: { choosePunctureDie: (_snapshot, dice) => dice[0]?.id ?? null },
	});
	const result = f.engine.resolveSingleAttack(f.request);
	assert.equal(result.damage?.rolledDamage, 4);
	assert.equal(allDamageDice(pool(result))[0]?.rerolledFrom, 7);
	assert.equal(f.encounter.hasUsed("hero", "piercer.puncture"), true);
	assert.equal(f.roller.remaining, 0);
});
test("Puncture can reroll class dice of another damage type and defaults to expected gain", () => {
	const f = fixture([10, 4, 1, 2, 12], {
		hooks: [piercerHook, { id: "extra", damageComponents: () => [component({ dice: [6, 12] })] }],
	});
	const result = f.engine.resolveSingleAttack(f.request);
	assert.deepEqual(result.damage?.byType, { piercing: 7, fire: 13 });
	const dice = allDamageDice(pool(result));
	assert.equal(dice[1]?.value, 1);
	assert.equal(dice[2]?.value, 12);
	assert.equal(dice[2]?.rerolledFrom, 2);
	assert.equal(f.roller.remaining, 0);
});
test("Puncture refusal, miss and nonpiercing attacks do not consume use or extra randomness", () => {
	const f = fixture([1, 10, 5, 10, 4, 10, 2, 7], { hooks: [piercerHook] });
	f.engine.resolveSingleAttack(f.request);
	f.engine.resolveSingleAttack(f.request); // d8=5: default declines.
	assert.equal(f.encounter.hasUsed("hero", "piercer.puncture"), false);
	f.engine.resolveSingleAttack({
		...f.request,
		weapon: greatsword,
		profile: { attackBonus: 5, damage: [component({ origin: "weapon", damageType: "slashing", dice: [6] })] },
	});
	assert.equal(f.encounter.hasUsed("hero", "piercer.puncture"), false);
	assert.equal(f.engine.resolveSingleAttack(f.request).damage?.rolledDamage, 10);
	assert.equal(f.roller.remaining, 0);
});
test("Piercer Enhanced Critical adds one undoubled piercing die on every crit independently of Puncture", () => {
	const f = fixture([20, 2, 6, 4, 7, 20, 3, 5, 4], { hooks: [piercerHook] });
	const first = f.engine.resolveSingleAttack(f.request);
	assert.equal(first.damage?.rolledDamage, 20);
	const second = f.engine.resolveSingleAttack(f.request);
	assert.equal(second.damage?.rolledDamage, 15);
	for (const result of [first, second]) {
		const additional = pool(result).filter((entry) => entry.origin === "feat");
		assert.equal(additional.length, 1);
		assert.equal(additional[0]?.doublesOnCrit, false);
		assert.equal(additional[0]?.damageType, "piercing");
		assert.deepEqual(
			additional[0]?.dice.map((die) => die.provenance),
			["additional"],
		);
	}
	assert.equal(f.roller.remaining, 0);
});
test("Piercer critical choice is optional and does not spend Puncture", () => {
	const f = fixture([20, 2, 6], {
		hooks: [piercerHook],
		strategy: { applyPiercerCritical: () => false, choosePunctureDie: () => null },
	});
	assert.equal(f.engine.resolveSingleAttack(f.request).damage?.rolledDamage, 11);
	assert.equal(f.encounter.hasUsed("hero", "piercer.puncture"), false);
	assert.equal(f.roller.remaining, 0);
});
test("Piercer critical default takes largest piercing die, excluding larger fire dice", () => {
	const rolls = [{ sides: 20, value: 20 }, ...[6, 6, 10, 10, 12, 12, 10].map((sides) => ({ sides, value: 4 }))];
	const f = fixture(rolls, { hooks: [piercerHook], strategy: { choosePunctureDie: () => null } });
	const result = f.engine.resolveSingleAttack({
		...f.request,
		profile: {
			attackBonus: 5,
			damage: [
				component({ id: "piercing", origin: "class", damageType: "piercing", dice: [6, 10] }),
				component({ id: "fire", dice: [12] }),
			],
		},
	});
	assert.equal(pool(result).at(-1)?.dice[0]?.sides, 10);
	assert.equal(allDamageDice(pool(result)).length, 7);
	assert.equal(f.roller.remaining, 0);
});
test("flat-only piercing creates no artificial critical die, but permits Puncture of other attack dice", () => {
	const f = fixture([20, 1, 2, 6], { hooks: [piercerHook] });
	const result = f.engine.resolveSingleAttack({
		...f.request,
		profile: {
			attackBonus: 5,
			damage: [component({ id: "flat", damageType: "piercing", dice: [], flatBonus: 3 }), component({ id: "fire" })],
		},
	});
	assert.deepEqual(result.damage?.byType, { piercing: 3, fire: 8 });
	assert.equal(
		pool(result).some((entry) => entry.origin === "feat"),
		false,
	);
	assert.equal(f.roller.remaining, 0);
});

test("Savage then Piercer preserves phase order and Puncture can reroll the chosen weapon pool", () => {
	const f = fixture([10, 2, 3, 8]);
	const result = f.engine.resolveSingleAttack(f.request);
	assert.equal(result.damage?.rolledDamage, 11);
	assert.equal(allDamageDice(pool(result))[0]?.rerolledFrom, 3);
	assert.deepEqual(
		result.decisions.map((decision) => decision.feature),
		["savage-attacker", "savage-attacker.weapon-roll", "piercer.puncture"],
	);
	assert.equal(f.roller.remaining, 0);
});
test("both once-per-turn feats support off-turn attacks and reset only on explicit global turn", () => {
	const f = fixture([10, 1, 2, 7, 10, 3, 10, 1, 2, 8]);
	f.encounter.endTurn();
	f.encounter.beginTurn("enemy");
	const reaction = { ...f.request, actionSource: "reaction" as const };
	assert.equal(f.engine.resolveSingleAttack(reaction).damage?.rolledDamage, 10);
	assert.equal(f.engine.resolveSingleAttack(reaction).damage?.rolledDamage, 6);
	f.encounter.endTurn();
	f.encounter.beginTurn("hero");
	assert.equal(f.engine.resolveSingleAttack(f.request).damage?.rolledDamage, 11);
	assert.equal(f.roller.remaining, 0);
});
test("independent encounters reuse the same build without inheriting feat usage or HP", () => {
	const first = fixture([10, 1, 2, 7]);
	first.engine.resolveSingleAttack(first.request);
	const encounter = new EncounterState([
		{ id: "hero", definition: first.hero },
		{ id: "enemy", definition: new BaseMonster("Target", 10, 1000) },
	]);
	const roller = new FixedDiceRoller([10, 1, 2, 7]);
	encounter.beginTurn("hero");
	const engine = new CombatEngine(encounter, { roller, hooks: [piercerHook, savageAttackerHook] });
	assert.equal(encounter.hasUsed("hero", "savage-attacker"), false);
	assert.equal(encounter.hasUsed("hero", "piercer.puncture"), false);
	assert.equal(engine.resolveSingleAttack(first.request).damage?.rolledDamage, 10);
	assert.equal(encounter.state("enemy").hitPoints, 990);
	assert.equal(roller.remaining, 0);
});

test("Puncture may reroll the additional Piercer critical die and retains its provenance", () => {
	const f = fixture([20, 7, 8, 1, 6], {
		hooks: [piercerHook],
		strategy: {
			choosePunctureDie: (_snapshot, dice) => dice.find((die) => die.provenance === "additional")?.id ?? null,
		},
	});
	const result = f.engine.resolveSingleAttack(f.request);
	assert.equal(result.damage?.rolledDamage, 24);
	const extra = allDamageDice(pool(result)).find((die) => die.provenance === "additional");
	assert.equal(extra?.value, 6);
	assert.equal(extra?.rerolledFrom, 1);
	assert.equal(f.roller.remaining, 0);
});
test("Piercer additional component ID avoids collisions with scenario contributions", () => {
	const f = fixture([20, 5, 6, 4], { hooks: [piercerHook], strategy: { choosePunctureDie: () => null } });
	const result = f.engine.resolveSingleAttack({
		...f.request,
		weapon: spear,
		profile: {
			attackBonus: 5,
			damage: [
				component({
					id: "feat.piercer.enhanced-critical",
					origin: "weapon",
					damageType: "piercing",
					dice: [8],
					flatBonus: 3,
				}),
			],
		},
	});
	assert.equal(result.damage?.rolledDamage, 18);
	assert.equal(pool(result).at(-1)?.id, "feat.piercer.enhanced-critical:additional");
	assert.equal(f.roller.remaining, 0);
});
