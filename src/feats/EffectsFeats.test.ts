import assert from "node:assert/strict";
import { test } from "node:test";
import BaseCharacter from "../character/BaseCharacter.ts";
import BaseClass from "../classes/BaseClass.ts";
import { CombatEngine } from "../combat/AttackResolver.ts";
import type { AttackRequest, CombatEngineOptions, CombatHook } from "../combat/CombatTypes.ts";
import type { DamageType } from "../combat/DamageTypes.ts";
import { EncounterState } from "../combat/EncounterState.ts";
import Dice from "../dice/dice.ts";
import { FixedDiceRoller, type FixedRoll } from "../dice/RandomSource.ts";
import Weapon, { type WeaponCombatMetadata } from "../Items/Weapon.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { EFeatName } from "./Feats.ts";
import { greatWeaponMasterHook } from "./GreatWeaponMaster.ts";
import { slasherHook } from "./Slasher.ts";

const sword = makeWeapon();
function makeWeapon(
	metadata: WeaponCombatMetadata = { category: "melee", properties: ["heavy"] },
	type: DamageType = "slashing",
) {
	return new Weapon("Test weapon", "", "martial", "common", 1, 1, "medium", [new Dice(10)], type, undefined, metadata);
}
function hero(weapon: Weapon, feats: EFeatName[]) {
	return new BaseCharacter(
		5,
		new BaseClass([weapon]),
		weapon,
		"strength",
		{
			strength: 18,
			dexterity: 10,
			constitution: 10,
			intelligence: 10,
			wisdom: 10,
			charisma: 10,
		},
		12,
		100,
		feats.map((name) => ({ name, type: "general" })),
	);
}
function fixture(
	rolls: readonly FixedRoll[],
	options: {
		weapon?: Weapon;
		hp?: number;
		speed?: number;
		feats?: EFeatName[];
		strategy?: CombatEngineOptions["strategy"];
		distanceFor?: CombatEngineOptions["distanceFor"];
		hooks?: readonly CombatHook[];
	} = {},
) {
	const weapon = options.weapon ?? sword;
	const encounter = new EncounterState([
		{ id: "hero", definition: hero(weapon, options.feats ?? [EFeatName.SLASHER, EFeatName.GREAT_WEAPON_MASTERY]) },
		{ id: "ally", definition: hero(weapon, [EFeatName.SLASHER]) },
		{ id: "enemy", definition: new BaseMonster("Enemy", 10, options.hp ?? 100, options.speed ?? 30) },
		{ id: "other", definition: new BaseMonster("Other", 10, 100) },
		{ id: "far", definition: new BaseMonster("Far", 10, 100) },
	]);
	const roller = new FixedDiceRoller(rolls);
	const engine = new CombatEngine(encounter, {
		roller,
		hooks: [slasherHook, greatWeaponMasterHook, ...(options.hooks ?? [])],
		strategy: { chooseHewTarget: () => null, ...options.strategy },
		...(options.distanceFor ? { distanceFor: options.distanceFor } : {}),
	});
	encounter.beginTurn("hero");
	const request: AttackRequest = {
		actorId: "hero",
		targetId: "enemy",
		actionSource: "attack-action",
		mode: weapon.category,
		weapon,
	};
	return { encounter, engine, roller, request };
}
const d20 = (value: number) => ({ sides: 20, value });
const d10 = (value: number) => ({ sides: 10, value });

test("Slasher limits Hamstring once per global turn; crit remains mandatory after use", () => {
	const { encounter, engine, request, roller } = fixture([
		d20(10),
		d10(5),
		d20(20),
		d10(5),
		d10(6),
		d20(20),
		d10(1),
		d10(1),
	]);
	engine.resolveSingleAttack(request);
	const second = engine.resolveSingleAttack({ ...request, targetId: "other" });
	assert.equal(encounter.effectiveSpeed("enemy"), 20);
	assert.equal(encounter.effectiveSpeed("other"), 30);
	assert.equal(encounter.hasAttackDisadvantage("other"), true);
	assert.equal(
		second.decisions.some((choice) => choice.feature === "slasher.hamstring"),
		false,
	);
	engine.resolveSingleAttack(request);
	assert.equal(encounter.effectsOn("enemy").length, 2);
	assert.equal(encounter.effectiveSpeed("enemy"), 20);
	assert.equal(roller.remaining, 0);
});

test("Slasher declined Hamstring does not disable critical effect or consume usage", () => {
	const { encounter, engine, request, roller } = fixture([d20(20), d10(5), d10(6)], {
		strategy: { useFeature: () => false },
	});
	const result = engine.resolveSingleAttack(request);
	assert.equal(encounter.effectiveSpeed("enemy"), 30);
	assert.equal(encounter.hasAttackDisadvantage("enemy"), true);
	assert.equal(encounter.hasUsed("hero", "slasher.hamstring"), false);
	assert.deepEqual(result.decisions, [
		{ feature: "great-weapon-master.heavy-weapon-mastery", choice: false },
		{ feature: "slasher.hamstring", choice: false },
		{ feature: "great-weapon-master.hew", choice: null },
	]);
	assert.equal(roller.remaining, 0);
});

test("Slasher retains distinct simultaneous sources until each source's next turn; speed floors at zero", () => {
	const { encounter, engine, request } = fixture([d20(20), d10(1), d10(1), d20(20), d10(1), d10(1)]);
	engine.resolveSingleAttack(request);
	engine.resolveSingleAttack({ ...request, actorId: "ally", actionSource: "reaction" });
	assert.equal(encounter.effectiveSpeed("enemy"), 20);
	assert.deepEqual(
		encounter.effectsOn("enemy").map((effect) => effect.sourceId),
		["hero", "hero", "ally", "ally"],
	);
	encounter.endTurn();
	encounter.beginTurn("enemy");
	assert.equal(encounter.effectsOn("enemy").length, 4);
	encounter.endTurn();
	encounter.beginTurn("hero");
	assert.equal(encounter.effectiveSpeed("enemy"), 20);
	assert.equal(encounter.hasAttackDisadvantage("enemy"), true);
	assert.equal(encounter.effectsOn("enemy").length, 2);
	encounter.endTurn();
	encounter.beginTurn("ally");
	assert.equal(encounter.effectiveSpeed("enemy"), 30);
	assert.equal(encounter.hasAttackDisadvantage("enemy"), false);
	const slow = fixture([d20(10), d10(1)], { speed: 5 });
	slow.engine.resolveSingleAttack(slow.request);
	assert.equal(slow.encounter.effectiveSpeed("enemy"), 0);
});

test("Slasher applies to ranged Slashing and resets usage on a new global turn; misses/non-Slashing do not consume it", () => {
	const ranged = fixture([d20(1), d20(10), d10(2), d20(10), d10(2)], { weapon: makeWeapon({ category: "ranged" }) });
	ranged.engine.resolveSingleAttack(ranged.request);
	assert.equal(ranged.encounter.hasUsed("hero", "slasher.hamstring"), false);
	ranged.engine.resolveSingleAttack(ranged.request);
	assert.equal(ranged.encounter.effectiveSpeed("enemy"), 20);
	ranged.encounter.endTurn();
	ranged.encounter.beginTurn("enemy");
	ranged.engine.resolveSingleAttack({ ...ranged.request, targetId: "other", actionSource: "reaction" });
	assert.equal(ranged.encounter.effectiveSpeed("other"), 20);
	const piercing = fixture([d20(20), d10(2), d10(3)], { weapon: makeWeapon({ category: "ranged" }, "piercing") });
	piercing.engine.resolveSingleAttack(piercing.request);
	assert.equal(piercing.encounter.effectsOn("enemy").length, 0);
	assert.equal(piercing.encounter.hasUsed("hero", "slasher.hamstring"), false);
});

test("Slasher gives monster outgoing Disadvantage on all attacks and external Advantage cancels", () => {
	for (const advantage of [false, true]) {
		const { encounter, engine, request, roller } = fixture(
			[d20(20), d10(1), d10(1), ...(advantage ? [d20(18)] : [d20(18), d20(4)])],
			{
				hooks: advantage
					? [
							{
								id: "external.advantage",
								applies: (ctx) => ctx.request.actorId === "enemy",
								attackModifiers: () => [{ source: "external", attackRoll: { advantage: 2 } }],
							},
						]
					: [],
			},
		);
		engine.resolveSingleAttack(request);
		encounter.endTurn();
		encounter.beginTurn("enemy");
		const result = engine.resolveSingleAttack({
			actorId: "enemy",
			targetId: "hero",
			actionSource: "other",
			mode: "ranged",
			profile: { attackBonus: 0, damage: [] },
		});
		assert.equal(result.hit.d20Roll, advantage ? 18 : 4);
		assert.deepEqual(result.hit.d20Rolls, advantage ? [18] : [18, 4]);
		assert.equal(roller.remaining, 0);
	}
});

test("Heavy Weapon Mastery adds PB to every own-turn Attack action hit including ranged, never doubles on crit", () => {
	for (const category of ["melee", "ranged"] as const) {
		const { engine, request, roller } = fixture([d20(10), d10(5), d20(10), d10(5), d20(20), d10(5), d10(6)], {
			weapon: makeWeapon({ category, properties: ["heavy"] }),
		});
		assert.equal(engine.resolveSingleAttack(request).damage?.rolledDamage, 12);
		assert.equal(engine.resolveSingleAttack(request).damage?.rolledDamage, 12);
		const result = engine.resolveSingleAttack(request);
		assert.equal(result.damage?.rolledDamage, 18);
		const bonus = result.damage?.components.find((component) => component.origin === "feat");
		assert.equal(bonus?.flatBonus, 3);
		assert.deepEqual(bonus?.dice, []);
		assert.equal(bonus?.damageType, "slashing");
		assert.equal(roller.remaining, 0);
	}
});

test("Heavy Weapon Mastery excludes off-turn, Reaction, other, Bonus Action, non-Heavy and refusal", () => {
	for (const actionSource of ["reaction", "other", "bonus-action"] as const) {
		const { engine, request } = fixture([d20(10), d10(5)]);
		assert.equal(engine.resolveSingleAttack({ ...request, actionSource }).damage?.rolledDamage, 9);
	}
	const offTurn = fixture([d20(10), d10(5)]);
	offTurn.encounter.endTurn();
	offTurn.encounter.beginTurn("enemy");
	assert.equal(offTurn.engine.resolveSingleAttack(offTurn.request).damage?.rolledDamage, 9);
	for (const options of [{ weapon: makeWeapon({ category: "melee" }) }, { strategy: { useFeature: () => false } }]) {
		const { engine, request } = fixture([d20(10), d10(5)], options);
		assert.equal(engine.resolveSingleAttack(request).damage?.rolledDamage, 9);
	}
});

test("Hew kill retargets immediately with same non-Heavy Melee weapon; engine spends exactly one Bonus Action", () => {
	const weapon = makeWeapon({ category: "melee" });
	const { encounter, engine, request, roller } = fixture([d20(10), d10(4), d20(10), d10(5)], {
		weapon,
		hp: 7,
		strategy: { chooseHewTarget: (_snapshot, targets) => targets.find((target) => target.id === "other")?.id ?? null },
	});
	const result = engine.resolveSingleAttack(request);
	assert.equal(result.damage?.hp.previousHp, 7);
	assert.equal(result.damage?.hp.currentHp, 0);
	assert.equal(result.damage?.hp.reducedToZero, true);
	assert.equal(result.triggeredAttacks.length, 1);
	assert.equal(result.triggeredAttacks[0]?.targetId, "other");
	assert.equal(result.triggeredAttacks[0]?.source, "feat.great-weapon-master.hew");
	assert.equal(result.triggeredAttacks[0]?.actionSource, "bonus-action");
	assert.equal(result.triggeredAttacks[0]?.damage?.rolledDamage, 9);
	assert.equal(result.triggeredAttacks[0]?.damage?.components[0]?.source, `weapon.${weapon.name}`);
	assert.equal(encounter.canUseBonusAction("hero"), false);
	assert.equal(roller.remaining, 0);
});

test("Hew critical+kill offers once; later triggers and chained critical Hew do not replenish Bonus Action", () => {
	let offers = 0;
	const { encounter, engine, request, roller } = fixture(
		[d20(20), d10(5), d10(6), d20(20), d10(2), d10(3), d20(20), d10(2), d10(3)],
		{
			hp: 7,
			strategy: {
				chooseHewTarget: () => {
					offers++;
					return "other";
				},
			},
		},
	);
	const result = engine.resolveSingleAttack(request);
	assert.equal(result.hit.isCrit, true);
	assert.equal(result.damage?.hp.reducedToZero, true);
	assert.equal(result.triggeredAttacks[0]?.triggeredAttacks.length, 0);
	assert.equal(result.triggeredAttacks[0]?.damage?.rolledDamage, 9);
	engine.resolveSingleAttack({ ...request, targetId: "other" });
	assert.equal(offers, 1);
	assert.equal(encounter.canUseBonusAction("hero"), false);
	assert.equal(roller.remaining, 0);
});

test("Hew refusal closes the immediate window; new independent trigger can offer again", () => {
	let offers = 0;
	const { encounter, engine, request } = fixture(
		[d20(20), d10(1), d10(1), d20(10), d10(1), d20(20), d10(1), d10(1), d20(10), d10(1)],
		{
			strategy: { chooseHewTarget: () => (++offers === 1 ? null : "other") },
		},
	);
	assert.equal(engine.resolveSingleAttack(request).triggeredAttacks.length, 0);
	assert.equal(encounter.canUseBonusAction("hero"), true);
	assert.equal(engine.resolveSingleAttack(request).triggeredAttacks.length, 0);
	assert.equal(offers, 1);
	assert.equal(engine.resolveSingleAttack(request).triggeredAttacks.length, 1);
	assert.equal(offers, 2);
});

test("Hew excludes off-turn, spent Bonus Action, noncritical zero-HP target and close Ranged weapon", () => {
	for (const variant of ["off-turn", "spent", "zero", "ranged"] as const) {
		let offers = 0;
		const { encounter, engine, request } = fixture(variant === "zero" ? [d20(10), d10(1)] : [d20(20), d10(1), d10(1)], {
			hp: variant === "zero" ? 0 : 100,
			weapon: makeWeapon({ category: variant === "ranged" ? "ranged" : "melee" }),
			strategy: {
				chooseHewTarget: () => {
					offers++;
					return null;
				},
			},
		});
		if (variant === "off-turn") {
			encounter.endTurn();
			encounter.beginTurn("enemy");
		}
		if (variant === "spent") encounter.spendBonusAction("hero");
		const result = engine.resolveSingleAttack({ ...request, distance: 1 });
		assert.equal(result.triggeredAttacks.length, 0);
		assert.equal(offers, 0);
	}
});

test("Hew uses Melee category for thrown attacks and validates fresh target geometry", () => {
	const { engine, request, roller } = fixture([d20(20), d10(1), d10(1), d20(10), d10(1)], {
		weapon: makeWeapon({ category: "melee", properties: ["thrown"], range: { normal: 20, long: 60 } }),
		strategy: {
			chooseHewTarget: (_snapshot, targets) => {
				assert.equal(
					targets.some((target) => target.id === "far"),
					false,
				);
				return "other";
			},
		},
		distanceFor: (_actor, target) => (target === "far" ? 70 : 10),
	});
	assert.equal(engine.resolveSingleAttack({ ...request, mode: "thrown" }).triggeredAttacks.length, 1);
	assert.equal(roller.remaining, 0);
	const invalid = fixture([d20(20), d10(1), d10(1)], {
		strategy: { chooseHewTarget: () => "far" },
		distanceFor: (_actor, target) => (target === "far" ? 10 : 5),
	});
	assert.throws(() => invalid.engine.resolveSingleAttack(invalid.request), /Invalid Hew target choice/);
	assert.equal(invalid.encounter.canUseBonusAction("hero"), true);
});
