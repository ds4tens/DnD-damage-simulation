import assert from "node:assert/strict";
import test from "node:test";
import BaseCharacter, { defaultStatBlock } from "../character/BaseCharacter.ts";
import Barbarian from "../classes/Barbarian.ts";
import BaseClass from "../classes/BaseClass.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { Dagger, Glaive, Rapier } from "../Items/Weapon/WeaponList.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { CombatEngine } from "./AttackResolver.ts";
import type { AttackSelection, CombatantInput, CombatHook } from "./CombatTypes.ts";
import { EncounterState } from "./EncounterState.ts";

// Basic Rules 2024 Glossary: Short/Long Rest, Critical Hit and Armor Training;
// PHB2024 p203: Dual Wielder. Verified 2026-10-08. The rider window is documented
// separately as the canonical Fire's Burn/Frost's Chill critical interpretation.
const poolHook: CombatHook = {
	id: "test.rest-pool",
	resourceDefinitions: () => [{ id: "test.pool", maxUses: 2, shortRest: "one", longRest: "all" }],
};
function restFixture(extra: Partial<CombatantInput> = {}) {
	const hero = new BaseCharacter(1, new BaseClass([Dagger]), Dagger, "strength", undefined, 16, 40);
	const encounter = new EncounterState([{ id: "hero", definition: hero, ...extra }]);
	const engine = new CombatEngine(encounter, { roller: new FixedDiceRoller([]), hooks: [poolHook] });
	return { encounter, engine };
}
test("completed Short Rest preserves health; Long Rest heals and ends Temporary HP", () => {
	const f = restFixture({ initialHitPoints: 27, initialTemporaryHp: 5, initialResources: { "test.pool": 0 } });
	const short = f.engine.completeRest("hero", "short-rest");
	assert.deepEqual(short.health, {
		previousHp: 27,
		currentHp: 27,
		previousTemporaryHp: 5,
		currentTemporaryHp: 5,
		hpRegained: 0,
	});
	assert.equal(f.encounter.resourceRemaining("hero", "test.pool"), 1);
	const long = f.engine.completeRest("hero", "long-rest");
	assert.deepEqual(long.health, {
		previousHp: 27,
		currentHp: 40,
		previousTemporaryHp: 5,
		currentTemporaryHp: 0,
		hpRegained: 13,
	});
	assert.equal(f.encounter.resourceRemaining("hero", "test.pool"), 2);
	assert.equal(Object.isFrozen(long.health), true);
});
test("resource-only recovery never heals; invalid completed rests mutate nothing", () => {
	const f = restFixture({ initialHitPoints: 20, initialTemporaryHp: 4, initialResources: { "test.pool": 0 } });
	f.engine.recoverResources("hero", "long-rest");
	assert.equal(f.encounter.state("hero").hitPoints, 20);
	assert.equal(f.encounter.state("hero").temporaryHp, 4);
	f.encounter.spendResource("hero", "test.pool", 2);
	f.engine.beginTurn("hero");
	assert.throws(() => f.engine.completeRest("hero", "long-rest"), /Invalid completed/);
	assert.equal(f.encounter.resourceRemaining("hero", "test.pool"), 0);
	f.engine.endTurn();
	for (const zeroHpBehavior of ["death-saves", "die"] as const) {
		const zero = restFixture({ initialHitPoints: 0, zeroHpBehavior, initialResources: { "test.pool": 0 } });
		const before = structuredClone(zero.encounter.state("hero"));
		assert.throws(() => zero.engine.completeRest("hero", "long-rest"), /at least 1 HP/);
		assert.deepEqual(zero.encounter.state("hero"), before);
	}
});
test("a second engine cannot reinitialize an encounter or restore its spent pools", () => {
	const f = restFixture();
	f.encounter.spendResource("hero", "test.pool");
	const before = structuredClone(f.encounter.state("hero"));
	assert.throws(
		() => new CombatEngine(f.encounter, { hooks: [poolHook], roller: new FixedDiceRoller([]) }),
		/Duplicate/,
	);
	assert.deepEqual(f.encounter.state("hero"), before);
});

function drawFixture(dualWielder: boolean, rolls: number[] = [12, 2]) {
	const hero = new BaseCharacter(
		4,
		new BaseClass([Dagger, Rapier, Glaive]),
		Dagger,
		"strength",
		{ ...defaultStatBlock, strength: 16, dexterity: 13 },
		16,
		40,
		dualWielder ? [{ name: "dual-wielder", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] }] : [],
	);
	const encounter = new EncounterState([
		{
			id: "hero",
			definition: hero,
			weapons: [
				{ id: "dagger", weapon: Dagger },
				{ id: "rapier", weapon: Rapier },
				{ id: "glaive", weapon: Glaive },
			],
			initialHands: { left: null, right: null },
		},
		{ id: "target", definition: new BaseMonster("Target", 12, 100), hitPointMode: "inexhaustible" },
	]);
	const roller = new FixedDiceRoller(rolls);
	// This core fixture tests Quick Draw itself; the canonical Bonus Action hook
	// is integrated and tested independently in the feat-owned module.
	const engine = new CombatEngine(encounter, {
		roller,
		distanceFor: () => 5,
		hooks: [{ id: "test.dual-wielder", featName: "dual-wielder" }],
	});
	engine.beginTurn("hero");
	const selection: AttackSelection = {
		targetId: "target",
		mode: "melee",
		weaponInstanceId: "dagger",
		equip: { kind: "draw", when: "before", weaponInstanceId: "dagger", hand: "left" },
		equipAdditional: { kind: "draw", when: "before", weaponInstanceId: "rapier", hand: "right" },
	};
	return { encounter, engine, roller, selection };
}
test("Dual Wielder Quick Draw exposes and resolves two physical draws with one attack", () => {
	const f = drawFixture(true);
	const choice = f.engine.legalAttackCandidates("hero", "target")[0];
	assert.equal(choice?.equipAdditional?.weaponInstanceId, "rapier");
	const action = f.engine.beginAttackAction("hero");
	const attack = f.engine.attackInAction(action, f.selection);
	assert.equal(attack.weaponInstanceId, "dagger");
	assert.deepEqual(f.encounter.state("hero").hands, { left: "dagger", right: "rapier" });
	assert.equal(f.engine.finishAttackAction(action).attacks.length, 1);
	assert.equal(f.roller.remaining, 0);
});
test("Quick Draw rejects missing entitlement, Two-Handed and mixed timing before budgets or RNG", () => {
	const absent = drawFixture(false);
	assert.throws(
		() => absent.engine.resolveSingleAttack({ ...absent.selection, actorId: "hero", actionSource: "attack-action" }),
		/Illegal/,
	);
	assert.equal(absent.encounter.canUseAction("hero"), true);
	assert.equal(absent.roller.remaining, 2);
	const f = drawFixture(true);
	for (const equipAdditional of [
		{ kind: "draw", when: "before", weaponInstanceId: "glaive", hand: "right" },
		{ kind: "draw", when: "after", weaponInstanceId: "rapier", hand: "right" },
	] as const) {
		assert.throws(
			() =>
				f.engine.resolveSingleAttack({
					...f.selection,
					equipAdditional,
					actorId: "hero",
					actionSource: "attack-action",
				}),
			/Illegal/,
		);
		assert.deepEqual(f.encounter.state("hero").hands, { left: null, right: null });
		assert.equal(f.encounter.canUseAction("hero"), true);
		assert.equal(f.roller.remaining, 2);
	}
});

test("post-primary attack rider doubles critical dice and opens only the damage reroll window", () => {
	const calls = { weapon: 0, critical: 0, damage: 0 };
	const hook: CombatHook = {
		id: "test.attack-rider",
		weaponDamage: (_ctx, pool) => {
			calls.weapon++;
			return pool;
		},
		additionalCriticalDice: (_ctx, pool) => {
			calls.critical++;
			return pool;
		},
		afterDamageRoll: (ctx, pool) => {
			calls.damage++;
			if (!ctx.primaryDamage) return pool;
			assert.equal(ctx.primaryDamage.byType.piercing, 8);
			return pool.map((component) => ({
				...component,
				dice: component.dice.map((die) =>
					die.value === 1 ? { ...die, value: ctx.damageRoller.roll(die.sides), rerolledFrom: 1 } : die,
				),
			}));
		},
		afterHitDamage: (ctx) => {
			ctx.dealAttackRiderDamage("target", [
				{
					id: "test.cold",
					source: "test.cold",
					origin: "other",
					damageType: "cold",
					dice: [6],
					flatBonus: 0,
					doublesOnCrit: true,
				},
			]);
		},
	};
	const hero = new BaseCharacter(1, new BaseClass([Dagger]), Dagger, "strength", { ...defaultStatBlock, strength: 16 });
	const encounter = new EncounterState([
		{ id: "hero", definition: hero },
		{ id: "target", definition: new BaseMonster("Target", 12, 100), hitPointMode: "inexhaustible" },
	]);
	const roller = new FixedDiceRoller([20, 2, 3, 1, 4, 5]);
	const engine = new CombatEngine(encounter, { roller, hooks: [hook] });
	engine.beginTurn("hero");
	const result = engine.resolveAttackAction("hero", "target");
	assert.equal(result.totalDamage, 17);
	assert.deepEqual(calls, { weapon: 1, critical: 1, damage: 2 });
	const rider = result.attacks[0]?.additionalDamage?.[0];
	assert.deepEqual(rider?.appliedByType, { cold: 9 });
	assert.deepEqual(
		rider?.components[0]?.dice.map((die) => die.provenance),
		["base", "critical-copy"],
	);
	assert.equal(engine.damageEvents.length, 2);
	assert.equal(roller.remaining, 0);
});
test("armor without training imposes Initiative Disadvantage and cancels Feral Instinct", () => {
	for (const [level, rolls, expected] of [
		[1, [17, 4, 10], [17, 4]],
		[7, [4, 10], [4]],
	] as const) {
		const hero = new BaseCharacter(level, new Barbarian([Dagger]), Dagger, "strength", defaultStatBlock, 18, 40, [], {
			armorCategory: "heavy",
			armorTrained: false,
		});
		const encounter = new EncounterState([
			{ id: "hero", definition: hero },
			{ id: "target", definition: new BaseMonster("Target", 12, 100) },
		]);
		const roller = new FixedDiceRoller(rolls);
		const engine = new CombatEngine(encounter, { roller });
		const scheduler = engine.createScheduler();
		assert.deepEqual(scheduler.initiative.find((item) => item.actorId === "hero")?.d20Rolls, expected);
		assert.deepEqual(scheduler.order, ["target", "hero"]);
		assert.equal(roller.remaining, 0);
	}
});
test("untrained armor affects Unarmed damage strikes and Strength/Dexterity saves, not mental saves", () => {
	const hero = new BaseCharacter(1, new BaseClass([Dagger]), Dagger, "strength", defaultStatBlock, 18, 40, [], {
		armorCategory: "heavy",
		armorTrained: false,
	});
	const encounter = new EncounterState([
		{ id: "hero", definition: hero },
		{ id: "target", definition: new BaseMonster("Target", 12, 100), hitPointMode: "inexhaustible" },
	]);
	const roller = new FixedDiceRoller([17, 4, 17, 4, 10, 12]);
	const engine = new CombatEngine(encounter, { roller });
	engine.beginTurn("hero");
	assert.deepEqual(engine.resolveAttackAction("hero", "target", { unarmed: true }).attacks[0]?.hit.d20Rolls, [17, 4]);
	assert.equal(
		engine.resolveSavingThrow({ targetId: "hero", ability: "strength", dc: 10, source: "test.save" }).natural,
		4,
	);
	assert.deepEqual(
		engine.resolveSavingThrow({ targetId: "hero", ability: "dexterity", dc: 10, source: "test.save", advantage: true })
			.d20Rolls,
		[10],
	);
	assert.deepEqual(
		engine.resolveSavingThrow({ targetId: "hero", ability: "wisdom", dc: 10, source: "test.save" }).d20Rolls,
		[12],
	);
	assert.equal(roller.remaining, 0);
});

function killFixture(separateSaveDamage: boolean) {
	const observed: boolean[] = [];
	const rider: CombatHook = {
		id: "test.rider",
		afterPrimaryDamage(ctx, result) {
			if (ctx.request.targetId !== "target") return;
			assert.equal(result.hit.isHit, false);
			assert.equal(result.damage?.appliedDamage, 3);
			const components = [
				{
					id: "test.rider",
					source: "test.rider",
					origin: "other" as const,
					damageType: "radiant" as const,
					dice: [],
					flatBonus: 2,
					doublesOnCrit: false,
				},
			];
			if (separateSaveDamage) {
				const save = ctx.resolveSavingThrow({
					targetId: "target",
					ability: "constitution",
					dc: 15,
					source: "test.poison",
				});
				if (!save.success) ctx.dealDamage("target", components);
			} else ctx.dealAttackRiderDamage("target", components);
		},
	};
	const trigger: CombatHook = {
		id: "test.trigger-before-rider-id",
		afterAttack(_ctx, result) {
			observed.push(result.attackDamageReducedToZero ?? false);
			return result.attackDamageReducedToZero ? [{ source: "test.hew", targetId: "other" }] : [];
		},
	};
	const hero = new BaseCharacter(
		4,
		new Barbarian([Glaive]),
		Glaive,
		"strength",
		{ ...defaultStatBlock, strength: 16 },
		16,
		40,
	);
	const encounter = new EncounterState([
		{ id: "hero", definition: hero, masteredWeaponIds: ["glaive"] },
		{ id: "target", definition: new BaseMonster("Target", 12, 4) },
		{ id: "other", definition: new BaseMonster("Other", 12, 100), hitPointMode: "inexhaustible" },
	]);
	const roller = new FixedDiceRoller(separateSaveDamage ? [1, 1] : [1, 12, 4]);
	const engine = new CombatEngine(encounter, {
		roller,
		hooks: [trigger, rider],
		strategy: {
			useFeature: (_snapshot, featureId) => featureId !== "barbarian.reckless-attack",
			orderTriggers: (_snapshot, ids) => [...ids].reverse(),
		},
	});
	engine.beginTurn("hero");
	return { encounter, engine, roller, observed };
}
test("positive Graze opens attack rider before trigger ordering and its kill belongs to the attack", () => {
	const f = killFixture(false);
	const attack = f.engine.resolveSingleAttack({
		actorId: "hero",
		targetId: "target",
		actionSource: "attack-action",
		mode: "melee",
	});
	assert.equal(attack.attackDamageReducedToZero, true);
	assert.equal(attack.triggeredAttacks[0]?.targetId, "other");
	assert.deepEqual(f.observed, [true, false]);
	assert.equal(f.encounter.state("target").lifeState, "dead");
	assert.equal(f.engine.damageEvents.length, 3);
	assert.equal(f.roller.remaining, 0);
});
test("a separate saving throw's damage kill never becomes an attack damage kill", () => {
	const f = killFixture(true);
	const attack = f.engine.resolveSingleAttack({
		actorId: "hero",
		targetId: "target",
		actionSource: "attack-action",
		mode: "melee",
	});
	assert.equal(f.encounter.state("target").lifeState, "dead");
	assert.equal(attack.attackDamageReducedToZero, false);
	assert.equal(attack.triggeredAttacks.length, 0);
	assert.equal(attack.savingThrows?.[0]?.success, false);
	assert.deepEqual(f.observed, [false]);
	assert.equal(f.roller.remaining, 0);
});
test("elapsed-time callback ends owned transient flags without restoring pools or clearing persistent state", () => {
	const hook: CombatHook = {
		id: "test.expiry",
		onElapsedTime: (ctx, minutes) => {
			assert.equal(minutes, 10);
			ctx.actorState.classState["test.form.active"] = false;
			delete ctx.actorState.sizeOverride;
			delete ctx.actorState.speedBonus;
		},
	};
	const hero = new BaseCharacter(1, new BaseClass([Dagger]), Dagger);
	const encounter = new EncounterState([
		{ id: "hero", definition: hero, initialClassState: { "test.form.active": true, "persistent.once": true } },
	]);
	const engine = new CombatEngine(encounter, { roller: new FixedDiceRoller([]), hooks: [poolHook, hook] });
	const state = encounter.state("hero");
	state.sizeOverride = "large";
	state.speedBonus = 10;
	encounter.spendResource("hero", "test.pool");
	engine.advanceElapsedTime(0);
	assert.equal(state.classState["test.form.active"], true);
	assert.throws(() => engine.advanceElapsedTime(1), /at least 10/);
	assert.equal(state.sizeOverride, "large");
	engine.advanceElapsedTime(10);
	assert.equal(state.classState["test.form.active"], false);
	assert.equal(state.classState["persistent.once"], true);
	assert.equal(state.sizeOverride, undefined);
	assert.equal(state.speedBonus, undefined);
	assert.equal(encounter.resourceRemaining("hero", "test.pool"), 1);
});
