import assert from "node:assert/strict";
import test from "node:test";
import BaseCharacter, { defaultStatBlock, type TStatBlock } from "../character/BaseCharacter.ts";
import Barbarian from "../classes/Barbarian.ts";
import BaseClass from "../classes/BaseClass.ts";
import {
	Battleaxe,
	Blowgun,
	Dagger,
	Dart,
	Glaive,
	Greatclub,
	Handaxe,
	HeavyCrossbow,
	Lance,
	Longbow,
	Longsword,
	Pistol,
	Spear,
} from "../Items/Weapon/WeaponList.ts";
import type Weapon from "../Items/Weapon.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import type { AttackRequest, HandState, WeaponInstance } from "./CombatTypes.ts";
import { EncounterState } from "./EncounterState.ts";
import { prepareWeaponAttack, validateMasterySelections } from "./WeaponCombat.ts";

function fixture(
	weapon: Weapon,
	options: {
		stats?: Partial<TStatBlock>;
		hands?: HandState;
		instances?: readonly WeaponInstance[];
		proficient?: boolean;
		mounted?: boolean;
	} = {},
) {
	const stats = { ...defaultStatBlock, strength: 16, dexterity: 14, ...options.stats };
	const actor = new BaseCharacter(
		1,
		new BaseClass(options.proficient === false ? [] : [weapon]),
		weapon,
		"strength",
		stats,
		16,
		30,
	);
	const instances = options.instances ?? [{ id: "main", weapon }];
	const encounter = new EncounterState([
		{
			id: "hero",
			definition: actor,
			weapons: instances,
			initialHands: options.hands ?? { left: "main", right: null },
			initialClassState: { mounted: options.mounted ?? false },
		},
		{ id: "target", definition: new BaseMonster("Target", 12, 30) },
	]);
	const request: AttackRequest = {
		actorId: "hero",
		targetId: "target",
		actionSource: "attack-action",
		actionId: "issued-action",
		weaponInstanceId: "main",
		mode: weapon.category,
		distance: 5,
	};
	return { encounter, request };
}

test("weapon ability and proficiency are independently selected for actual attack and damage", () => {
	const { encounter, request } = fixture(Dagger, { stats: { strength: 12, dexterity: 16 } });
	const dex = prepareWeaponAttack(encounter, { ...request, ability: "dexterity" });
	assert.equal(dex.attackAbility, "dexterity");
	assert.equal(dex.attackBonus, 5);
	assert.equal(dex.damageComponents[0]?.flatBonus, 3);
	const str = prepareWeaponAttack(encounter, { ...request, ability: "strength" });
	assert.equal(str.attackBonus, 3);
	assert.equal(str.damageComponents[0]?.flatBonus, 1);
	assert.throws(() => prepareWeaponAttack(encounter, { ...request, ability: "wisdom" }));
	const axe = fixture(Handaxe);
	assert.throws(() => prepareWeaponAttack(axe.encounter, { ...axe.request, ability: "dexterity" }));
	const noProf = fixture(Dagger, { proficient: false });
	assert.equal(prepareWeaponAttack(noProf.encounter, noProf.request).attackBonus, 3);
});

test("2024 Heavy uses ability score 13 rather than size, category matters", () => {
	for (const [weapon, ability] of [
		[Glaive, "strength"],
		[Longbow, "dexterity"],
	] as const) {
		for (const score of [12, 13]) {
			const { encounter, request } = fixture(weapon, { stats: { [ability]: score } });
			const prepared = prepareWeaponAttack(encounter, request);
			assert.equal(
				prepared.attackModifiers.some((modifier) => modifier.source === "weapon.heavy"),
				score === 12,
			);
		}
	}
});

test("range and reach endpoints are exact and illegal preparation never mutates hands", () => {
	const { encounter, request } = fixture(Handaxe);
	for (const distance of [20, 20.01, 60]) {
		const prepared = prepareWeaponAttack(encounter, { ...request, mode: "thrown", distance });
		assert.equal(
			prepared.attackModifiers.some((modifier) => modifier.source === "weapon.long-range"),
			distance > 20,
		);
		assert.deepEqual(prepared.nextHands, { left: null, right: null });
		assert.deepEqual(encounter.state("hero").hands, { left: "main", right: null });
	}
	assert.throws(() => prepareWeaponAttack(encounter, { ...request, mode: "thrown", distance: 60.01 }));
	const reach = fixture(Glaive);
	assert.doesNotThrow(() => prepareWeaponAttack(reach.encounter, { ...reach.request, distance: 10 }));
	assert.throws(() => prepareWeaponAttack(reach.encounter, { ...reach.request, distance: 10.01 }));
	assert.throws(() => prepareWeaponAttack(reach.encounter, { ...reach.request, mode: "thrown" }));
});

test("Versatile affects only two-handed melee and Lance requires a mounted scenario exception", () => {
	const { encounter, request } = fixture(Longsword);
	assert.deepEqual(prepareWeaponAttack(encounter, { ...request, grip: "one-handed" }).damageComponents[0]?.dice, [8]);
	assert.deepEqual(prepareWeaponAttack(encounter, { ...request, grip: "two-handed" }).damageComponents[0]?.dice, [10]);
	const spear = fixture(Spear);
	assert.deepEqual(
		prepareWeaponAttack(spear.encounter, { ...spear.request, mode: "thrown", grip: "two-handed" }).damageComponents[0]
			?.dice,
		[6],
	);
	const lance = fixture(Lance);
	assert.throws(() => prepareWeaponAttack(lance.encounter, { ...lance.request, grip: "one-handed" }));
	const mounted = fixture(Lance, { mounted: true, hands: { left: "main", right: "$shield" } });
	assert.doesNotThrow(() => prepareWeaponAttack(mounted.encounter, { ...mounted.request, grip: "one-handed" }));
	assert.throws(() => prepareWeaponAttack(mounted.encounter, { ...mounted.request, grip: "two-handed" }));
});

test("hands, ammo loading and two-handed attacks enforce occupied hand restrictions", () => {
	for (const weapon of [Pistol, HeavyCrossbow, Glaive]) {
		const { encounter, request } = fixture(weapon, { hands: { left: "main", right: "$shield" } });
		assert.throws(() => prepareWeaponAttack(encounter, request));
	}
	const blowgun = fixture(Blowgun);
	const prepared = prepareWeaponAttack(blowgun.encounter, blowgun.request);
	assert.deepEqual(prepared.damageComponents[0]?.dice, []);
	assert.equal(prepared.damageComponents[0]?.flatBonus, 3, "flat weapon 1 plus DEX 2");
	assert.ok(prepared.limitations.some((limitation) => limitation.includes("unlimited")));
});

test("Loading distinguishes real instances and issued actions while preparation spends nothing", () => {
	const { encounter, request } = fixture(Pistol, {
		instances: [
			{ id: "main", weapon: Pistol },
			{ id: "other", weapon: Pistol },
		],
	});
	const first = prepareWeaponAttack(encounter, request);
	assert.equal(first.loadingKey, JSON.stringify(["hero", "issued-action", "main"]));
	assert.equal(prepareWeaponAttack(encounter, request).loadingKey, first.loadingKey);
	assert.notEqual(
		prepareWeaponAttack(encounter, { ...request, actionId: "new-issued-action" }).loadingKey,
		first.loadingKey,
	);
	encounter.state("hero").hands = { left: "other", right: null };
	const other = prepareWeaponAttack(encounter, { ...request, weaponInstanceId: "other" });
	assert.notEqual(other.loadingKey, first.loadingKey);
	const { actionId, ...withoutActionId } = request;
	assert.ok(actionId);
	assert.throws(() => prepareWeaponAttack(encounter, withoutActionId));
});

test("one equip/stow before/after per Attack-action attack has pure next-hands output", () => {
	const { encounter, request } = fixture(Longsword, { hands: { left: null, right: null } });
	const draw = prepareWeaponAttack(encounter, {
		...request,
		equip: { kind: "draw", weaponInstanceId: "main", hand: "left", when: "before" },
	});
	assert.deepEqual(draw.nextHands, { left: "main", right: null });
	assert.equal(draw.manipulationCost, 1);
	assert.deepEqual(encounter.state("hero").hands, { left: null, right: null });
	assert.throws(() =>
		prepareWeaponAttack(encounter, {
			...request,
			equip: { kind: "draw", weaponInstanceId: "main", hand: "left", when: "after" },
		}),
	);
	const held = fixture(Longsword);
	const stow = prepareWeaponAttack(held.encounter, {
		...held.request,
		equip: { kind: "stow", weaponInstanceId: "main", hand: "left", when: "after" },
	});
	assert.deepEqual(stow.nextHands, { left: null, right: null });
	assert.throws(() =>
		prepareWeaponAttack(held.encounter, {
			...held.request,
			actionSource: "bonus-action",
			equip: { kind: "stow", weaponInstanceId: "main", hand: "left", when: "after" },
		}),
	);
});

test("Thrown drawing is built in but released instances need explicit new stock IDs", () => {
	const { encounter, request } = fixture(Handaxe, { hands: { left: null, right: null } });
	const thrown = prepareWeaponAttack(encounter, { ...request, mode: "thrown", actionSource: "bonus-action" });
	assert.equal(thrown.thrownInstanceId, "main");
	assert.equal(thrown.manipulationCost, 0);
	assert.deepEqual(thrown.nextHands, { left: null, right: null });
	assert.throws(() =>
		prepareWeaponAttack(encounter, {
			...request,
			mode: "thrown",
			equip: { kind: "draw", when: "after", hand: "left", weaponInstanceId: "main" },
		}),
	);
	encounter.state("hero").spentWeaponInstanceIds.add("main");
	assert.throws(() => prepareWeaponAttack(encounter, { ...request, mode: "thrown" }));
	encounter.provideWeaponInstance("hero", { id: "fresh", weapon: Handaxe });
	assert.doesNotThrow(() => prepareWeaponAttack(encounter, { ...request, weaponInstanceId: "fresh", mode: "thrown" }));
	assert.throws(() => encounter.provideWeaponInstance("hero", { id: "main", weapon: Handaxe }));
	const dart = fixture(Dart);
	assert.equal(prepareWeaponAttack(dart.encounter, dart.request).thrownInstanceId, "main");
});

test("Light, Nick and Cleave suppress only positive ability damage; Push remains a limitation", () => {
	for (const attackOrigin of ["light", "nick", "cleave"] as const) {
		for (const strength of [16, 8]) {
			const { encounter, request } = fixture(Handaxe, { stats: { strength } });
			const prepared = prepareWeaponAttack(encounter, { ...request, attackOrigin });
			assert.equal(prepared.damageComponents[0]?.flatBonus, strength === 16 ? 0 : -1);
		}
	}
	const push = fixture(Greatclub);
	assert.ok(prepareWeaponAttack(push.encounter, push.request).limitations.some((item) => item.includes("Push")));
});

test("mastery selections validate entitlement, class count and proficiency independently", () => {
	const actor = new BaseCharacter(1, new Barbarian([Dagger, Handaxe, Battleaxe, Longbow]), Dagger);
	const make = (masteredWeaponNames: readonly string[]) =>
		new EncounterState([{ id: "hero", definition: actor, masteredWeaponNames }]);
	assert.doesNotThrow(() => validateMasterySelections(make(["Dagger", "Handaxe"]), "hero"));
	assert.throws(() => validateMasterySelections(make(["Dagger", "Handaxe", "Battleaxe"]), "hero"));
	assert.throws(() => validateMasterySelections(make(["Dagger", "dagger"]), "hero"));
	assert.throws(() => validateMasterySelections(make(["Longbow"]), "hero"));
	assert.throws(() => validateMasterySelections(make(["Longsword"]), "hero"));
	assert.throws(() => validateMasterySelections(make(["unknown"]), "hero"));
	const noEntitlement = fixture(Dagger);
	assert.doesNotThrow(() => validateMasterySelections(noEntitlement.encounter, "hero"));
});
