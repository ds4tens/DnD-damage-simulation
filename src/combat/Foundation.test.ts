import assert from "node:assert/strict";
import { test } from "node:test";
import BaseCharacter from "../character/BaseCharacter.ts";
import Barbarian from "../classes/Barbarian.ts";
import Berserker from "../classes/BarbarianSubclasses/Berserker.ts";
import WildHeart from "../classes/BarbarianSubclasses/WildHeart.ts";
import Zealot from "../classes/BarbarianSubclasses/Zealot.ts";
import BaseClass from "../classes/BaseClass.ts";
import Dice from "../dice/dice.ts";
import { FixedDiceRoller, SeededDiceRoller, UniformDiceRoller } from "../dice/RandomSource.ts";
import { EFeatName } from "../feats/Feats.ts";
import { EWeaponMastery } from "../Items/Weapon/WeaponMastery.ts";
import Weapon from "../Items/Weapon.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { CombatEngine, rollAttackD20 } from "./AttackResolver.ts";
import type { AttackRequest, CombatHook } from "./CombatTypes.ts";
import { allDamageDice, appendAdditionalDie, rerollDamageDie, rollDamageComponents } from "./DamageResolver.ts";
import type { DamageComponent } from "./DamageTypes.ts";
import { EncounterState } from "./EncounterState.ts";

/** Synthetic Extra Attack supplies legal slots for isolated feature phase tests. */
class TestAttackClass extends BaseClass {
	override getAttackCount(_level: number): number {
		return 8;
	}
}
const weapon = new Weapon("Test spear", "", "simple", "common", 1, 1, "medium", [new Dice(8)], "piercing");
function character(characterClass = new TestAttackClass([weapon]), level = 4): BaseCharacter {
	return new BaseCharacter(
		level,
		characterClass,
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
		50,
	);
}
function fixture(
	rolls: number[],
	options: {
		hooks?: CombatHook[];
		class?: BaseClass;
		level?: number;
		hp?: number;
		initialHp?: number;
		zeroHpBehavior?: "die" | "death-saves";
		ac?: number;
		classState?: Record<string, number | boolean | string>;
		strategy?: ConstructorParameters<typeof CombatEngine>[1]["strategy"];
	} = {},
) {
	const hero = character(options.class, options.level);
	const encounter = new EncounterState([
		{ id: "hero", definition: hero, initialClassState: options.classState ?? {} },
		{
			id: "enemy",
			definition: new BaseMonster("Target", options.ac ?? 12, options.hp ?? 50),
			...(options.initialHp !== undefined ? { initialHitPoints: options.initialHp } : {}),
			...(options.zeroHpBehavior ? { zeroHpBehavior: options.zeroHpBehavior } : {}),
		},
		{ id: "other", definition: new BaseMonster("Other", 12, 50) },
	]);
	const roller = new FixedDiceRoller(rolls);
	const engine = new CombatEngine(encounter, {
		roller,
		allowScenarioReactions: true,
		hooks: options.hooks ?? [],
		...(options.strategy ? { strategy: options.strategy } : {}),
	});
	engine.beginTurn("hero");
	const request: AttackRequest = {
		actorId: "hero",
		targetId: "enemy",
		mode: "melee",
		actionSource: "attack-action",
		action: engine.beginAttackAction("hero"),
	};
	return { hero, encounter, roller, engine, request };
}
const extra: DamageComponent = {
	id: "bonus.fire",
	source: "test",
	origin: "class",
	damageType: "fire",
	dice: [6],
	flatBonus: 2,
	doublesOnCrit: true,
};

test("uniform dice use all equally sized intervals and exact endpoints", () => {
	for (let index = 0; index < 20; index++)
		assert.equal(new UniformDiceRoller(() => (index + 0.5) / 20).roll(20), index + 1);
	assert.equal(new UniformDiceRoller(() => 0).roll(20), 1);
	assert.equal(new UniformDiceRoller(() => 1 - Number.EPSILON).roll(20), 20);
	assert.throws(() => new UniformDiceRoller(() => 1).roll(20));
	assert.throws(() => new Dice(0));
});
test("fixed dice validate size/value and never silently run out", () => {
	const roller = new FixedDiceRoller([{ sides: 20, value: 20 }, 1]);
	assert.throws(() => roller.roll(6), /Expected d20/);
	assert.equal(roller.remaining, 2);
	assert.equal(roller.roll(20), 20);
	assert.equal(roller.roll(6), 1);
	assert.throws(() => roller.roll(6), /exhausted/);
	assert.throws(() => new FixedDiceRoller([7]).roll(6), /Invalid/);
});
test("seeded Mulberry32 has a pinned sequence and independent instances reproduce it", () => {
	const first = new SeededDiceRoller(1);
	const second = new SeededDiceRoller(1);
	const values = Array.from({ length: 5 }, () => first.roll(20));
	assert.deepEqual(values, [13, 1, 11, 20, 20]);
	assert.deepEqual(
		Array.from({ length: 5 }, () => second.roll(20)),
		values,
	);
	assert.throws(() => new SeededDiceRoller(-1));
});
test("natural 1 misses despite a high modifier; natural 20 hits impossible AC and crits", () => {
	const miss = fixture([1], { ac: 1 });
	const missed = miss.engine.resolveSingleAttack(miss.request);
	assert.equal(missed.hit.totalAttackRoll, 6);
	assert.equal(missed.hit.isHit, false);
	assert.equal(missed.hit.isCrit, false);
	const crit = fixture([20, 1, 2], { ac: 100 });
	const hit = crit.engine.resolveSingleAttack(crit.request);
	assert.equal(hit.hit.isHit, true);
	assert.equal(hit.hit.isCrit, true);
	assert.equal(hit.damage?.rolledDamage, 6);
});
test("total 20 is an ordinary hit and AC equality hits", () => {
	const f = fixture([15, 2], { ac: 20 });
	const result = f.engine.resolveSingleAttack(f.request);
	assert.equal(result.hit.totalAttackRoll, 20);
	assert.equal(result.hit.isHit, true);
	assert.equal(result.hit.isCrit, false);
	assert.equal(result.damage?.rolledDamage, 5);
});
test("advantage and disadvantage cancel regardless of source counts", () => {
	const roller = new FixedDiceRoller([9]);
	assert.deepEqual(rollAttackD20({ source: "test", attackRoll: { advantage: 3, disadvantage: 1 } }, roller), {
		natural: 9,
		rolls: [9],
	});
	assert.equal(roller.remaining, 0);
	assert.deepEqual(rollAttackD20({ source: "test", attackRoll: { advantage: 1 } }, new FixedDiceRoller([2, 19])), {
		natural: 19,
		rolls: [2, 19],
	});
	assert.deepEqual(rollAttackD20({ source: "test", attackRoll: { disadvantage: 1 } }, new FixedDiceRoller([2, 19])), {
		natural: 2,
		rolls: [2, 19],
	});
});
test("forced critical hits cannot turn misses into critical hits", () => {
	const f = fixture([1], {
		hooks: [{ id: "forced", attackModifiers: () => [{ source: "forced", hit: { forceCritOnHit: true } }] }],
	});
	assert.equal(f.engine.resolveSingleAttack(f.request).hit.isCrit, false);
});
test("damage components preserve types, provenance, flat bonuses and bonus dice on crit", () => {
	const f = fixture([20, 1, 2, 3, 4], { hooks: [{ id: "extra", damageComponents: () => [extra] }] });
	const result = f.engine.resolveSingleAttack(f.request);
	assert.deepEqual(result.damage?.byType, { piercing: 6, fire: 9 });
	assert.equal(result.damage?.rolledDamage, 15);
	const dice = result.damage ? allDamageDice(result.damage.components) : [];
	assert.deepEqual(
		dice.map((die) => die.provenance),
		["base", "critical-copy", "base", "critical-copy"],
	);
	assert.equal(dice[2]?.sides, 6);
});
test("additional critical dice never double and rerolls must accept worse results", () => {
	const roller = new FixedDiceRoller([6, 5, 3, 1]);
	const pool = rollDamageComponents([extra], true, roller);
	const added = appendAdditionalDie(
		pool,
		{ id: "piercer", source: "test", origin: "feat", damageType: "piercing", flatBonus: 0 },
		8,
		roller,
	);
	const die = allDamageDice(added)[0];
	assert.ok(die);
	const result = rerollDamageDie(added, die.id, roller);
	assert.deepEqual(
		allDamageDice(result).map((entry) => entry.value),
		[1, 5, 3],
	);
	assert.equal(allDamageDice(result)[0]?.rerolledFrom, 6);
	assert.equal(allDamageDice(result)[2]?.provenance, "additional");
});
test("phases run weapon choice before class dice, then critical benefit, reroll, onHit and HP", () => {
	const order: string[] = [];
	const f = fixture([10, 2, 3], {
		hooks: [
			{
				id: "stages",
				weaponDamage: (_ctx, pool) => {
					order.push("weapon");
					assert.equal(allDamageDice(pool).length, 1);
					return pool;
				},
				damageComponents: () => {
					order.push("components");
					return [extra];
				},
				additionalCriticalDice: (_ctx, pool) => {
					order.push("critical");
					assert.equal(allDamageDice(pool).length, 2);
					return pool;
				},
				afterDamageRoll: (_ctx, pool) => {
					order.push("reroll");
					return pool;
				},
				onHit: (ctx) => {
					order.push("onHit");
					assert.equal(ctx.targetState.hitPoints, 50);
				},
				afterAttack: (_ctx, result) => {
					order.push("afterAttack");
					assert.equal(result.damage?.hp.currentHp, 40);
					return [];
				},
			},
		],
	});
	f.engine.resolveSingleAttack(f.request);
	assert.deepEqual(order, ["weapon", "components", "critical", "reroll", "onHit", "afterAttack"]);
});
test("HP floors at zero, overkill stays damage and an already-zero target produces no new transition", () => {
	const f = fixture([10, 8, 10, 10, 1, 1], { hp: 50, initialHp: 5, zeroHpBehavior: "death-saves" });
	const first = f.engine.resolveSingleAttack({ ...f.request, distance: 5 });
	assert.deepEqual(first.damage?.hp, {
		targetId: "enemy",
		previousHp: 5,
		currentHp: 0,
		damageTaken: 11,
		hpLost: 5,
		reducedToZero: true,
		previousTemporaryHp: 0,
		currentTemporaryHp: 0,
		temporaryHpLost: 0,
		overflow: 6,
		previousLifeState: "alive",
		currentLifeState: "dying",
		previousDeathSaves: { successes: 0, failures: 0 },
		currentDeathSaves: { successes: 0, failures: 0 },
	});
	const second = f.engine.resolveSingleAttack({ ...f.request, distance: 5 });
	assert.equal(second.damage?.hp.reducedToZero, false);
	assert.equal(second.damage?.hp.hpLost, 0);
	assert.equal(second.damage?.hp.currentDeathSaves.failures, 2);
	assert.equal(f.hero.hitPoints, 50);
});
test("once-per-turn state spans separate calls and reactions; only explicit beginTurn resets it", () => {
	const seen: boolean[] = [];
	const f = fixture([10, 1, 10, 1, 10, 1, 10, 1], {
		hooks: [
			{
				id: "usage",
				onHit: (ctx) => {
					seen.push(ctx.hasUsed("test.once"));
					if (!ctx.hasUsed("test.once")) ctx.markUsed("test.once");
				},
			},
		],
	});
	f.engine.resolveSingleAttack(f.request);
	assert.throws(() => f.encounter.beginTurn("hero"), /End/);
	f.engine.resolveSingleAttack({
		...f.request,
		actionSource: "reaction",
		grant: f.engine.grantScenarioReaction({ ...f.request, actionSource: "reaction" }),
	});
	f.encounter.endTurn();
	f.engine.beginTurn("hero"); // Restore Reaction only on the actor's next own turn.
	f.engine.endTurn();
	f.engine.beginTurn("enemy");
	f.engine.resolveSingleAttack({
		...f.request,
		actionSource: "reaction",
		grant: f.engine.grantScenarioReaction({ ...f.request, actionSource: "reaction" }),
	});
	f.encounter.endTurn();
	f.engine.beginTurn("hero");
	f.request.action = f.engine.beginAttackAction("hero");
	f.engine.resolveSingleAttack(f.request);
	assert.deepEqual(seen, [false, true, false, false]);
});
test("first-hit tracking persists across calls, but misses do not consume it", () => {
	const firstHit: boolean[] = [];
	const f = fixture([1, 10, 1, 10, 1], {
		hooks: [{ id: "first", onHit: (ctx) => firstHit.push(ctx.hasHitOccurredThisTurn) }],
	});
	f.engine.resolveSingleAttack(f.request);
	f.engine.resolveSingleAttack(f.request);
	f.engine.resolveSingleAttack(f.request);
	assert.deepEqual(firstHit, [false, true]);
});
test("same-effect reductions do not stack; independent sources expire separately at source start", () => {
	const f = fixture([]);
	const effect = {
		kind: "slasher.hamstring",
		sourceId: "hero",
		targetId: "enemy",
		expires: "start-of-source-next-turn" as const,
		speedReduction: 10,
	};
	f.encounter.addEffect(effect);
	f.encounter.addEffect(effect);
	f.encounter.addEffect({ ...effect, sourceId: "other" });
	assert.equal(f.encounter.effectiveSpeed("enemy"), 20);
	assert.equal(f.encounter.effectsOn("enemy").length, 2);
	f.encounter.endTurn();
	f.encounter.beginTurn("enemy");
	assert.equal(f.encounter.effectiveSpeed("enemy"), 20);
	f.encounter.endTurn();
	f.encounter.beginTurn("hero");
	assert.equal(f.encounter.effectsOn("enemy").length, 1);
	assert.equal(f.encounter.effectiveSpeed("enemy"), 20);
	f.encounter.endTurn();
	f.encounter.beginTurn("other");
	assert.equal(f.encounter.effectiveSpeed("enemy"), 30);
	f.encounter.addEffect({ ...effect, speedReduction: 100 });
	assert.equal(f.encounter.effectiveSpeed("enemy"), 0);
});
test("timed outgoing disadvantage affects explicit monster attacks and cancels advantage", () => {
	const f = fixture([19, 2, 4, 11, 4]);
	f.encounter.addEffect({
		kind: "slasher.critical",
		sourceId: "hero",
		targetId: "enemy",
		expires: "start-of-source-next-turn",
		attackDisadvantage: true,
	});
	f.encounter.endTurn();
	f.encounter.beginTurn("enemy");
	const request: AttackRequest = {
		actorId: "enemy",
		targetId: "hero",
		mode: "melee",
		actionSource: "attack-action",
		profile: {
			attackBonus: 20,
			damage: [{ ...extra, origin: "other", dice: [6] }],
		},
	};
	assert.deepEqual(f.engine.resolveSingleAttack(request).hit.d20Rolls, [19, 2]);
	f.encounter.state("enemy").conditions.push({ name: "invisible" });
	const reaction = { ...request, actionSource: "reaction" as const };
	assert.deepEqual(
		f.engine.resolveSingleAttack({ ...reaction, grant: f.engine.grantScenarioReaction(reaction) }).hit.d20Rolls,
		[11],
	);
});
test("bonus action belongs to the turn owner and is consumed exactly once", () => {
	const f = fixture([10, 1, 10, 1], {
		hooks: [
			{
				id: "test.bonus",
				afterAttack: (ctx) =>
					ctx.encounter.canUseBonusAction("hero") ? [{ targetId: "enemy", source: "test.bonus" }] : [],
			},
		],
	});
	assert.equal(f.encounter.canUseBonusAction("enemy"), false);
	assert.throws(() => f.encounter.spendBonusAction("enemy"), /unavailable/);
	f.engine.resolveSingleAttack(f.request);
	assert.equal(f.encounter.canUseBonusAction("hero"), false);
	assert.throws(() => f.engine.resolveSingleAttack({ ...f.request, actionSource: "bonus-action" }), /grant/);
	f.encounter.endTurn();
	f.encounter.beginTurn("hero");
	assert.equal(f.encounter.canUseBonusAction("hero"), true);
});
test("triggered attacks resolve immediately with same weapon and bonus-action source", () => {
	const f = fixture([20, 1, 1, 10, 2], {
		hooks: [
			{
				id: "trigger",
				afterAttack: (ctx, result) => {
					if (!result.hit.isCrit || !ctx.encounter.canUseBonusAction(ctx.request.actorId)) return [];
					return [{ targetId: "other", source: "test.hew" }];
				},
			},
		],
	});
	const result = f.engine.resolveSingleAttack(f.request);
	assert.equal(result.triggeredAttacks.length, 1);
	assert.equal(result.triggeredAttacks[0]?.targetId, "other");
	assert.equal(result.triggeredAttacks[0]?.actionSource, "bonus-action");
	assert.equal(result.triggeredAttacks[0]?.damage?.components[0]?.source, "weapon.Test spear");
	assert.equal(f.encounter.canUseBonusAction("hero"), false);
});
test("strategy sees frozen known information, no roller/state, and invalid decisions are rejected", () => {
	let snapshotObserved = false;
	const f = fixture([10, 1], {
		hooks: [
			{
				id: "decision",
				afterDamageRoll: (ctx, pool) => {
					ctx.useFeature("test.optional");
					ctx.choosePunctureDie(allDamageDice(pool));
					return pool;
				},
			},
		],
		strategy: {
			useFeature: (snapshot) => {
				snapshotObserved = true;
				assert.equal(Object.isFrozen(snapshot), true);
				assert.equal(Object.isFrozen(snapshot.target), true);
				assert.equal("roller" in snapshot, false);
				assert.equal("encounter" in snapshot, false);
				assert.equal(snapshot.hit?.d20Roll, 10);
				return false;
			},
			choosePunctureDie: () => "future-die",
		},
	});
	assert.throws(() => f.engine.resolveSingleAttack(f.request), /Invalid damage die/);
	assert.equal(snapshotObserved, true);
});
test("weapon pool selections are validated; snapshot candidates cannot mutate actual pools", () => {
	const f = fixture([10, 1], {
		hooks: [
			{
				id: "choice",
				weaponDamage: (ctx, pool) => {
					ctx.chooseWeaponRoll([pool]);
					return pool;
				},
			},
		],
		strategy: {
			chooseWeaponRoll: (_snapshot, pools) => {
				assert.equal(Object.isFrozen(pools[0]?.[0]?.dice[0]), true);
				return 1;
			},
		},
	});
	assert.throws(() => f.engine.resolveSingleAttack(f.request), /Invalid weapon roll/);
});
test("Piercer critical benefit is optional and stable defaults choose largest candidate", () => {
	let choice: string | null | undefined;
	const hook: CombatHook = {
		id: "critical-choice",
		additionalCriticalDice: (ctx, pool) => {
			choice = ctx.choosePiercerCriticalDie(allDamageDice(pool));
			return pool;
		},
	};
	const f = fixture([20, 1, 1], { hooks: [hook], strategy: { applyPiercerCritical: () => false } });
	f.engine.resolveSingleAttack(f.request);
	assert.equal(choice, null);
});
test("independent encounters detach mutable stats/conditions/class resources from shared builds", () => {
	const hero = character(new Barbarian([weapon]), 1);
	const first = new EncounterState([{ id: "hero", definition: hero, initialClassState: { raging: true } }]);
	const second = new EncounterState([{ id: "hero", definition: hero }]);
	first.state("hero").classState.raging = false;
	first.state("hero").conditions.push({ name: "poisoned" });
	first.state("hero").hitPoints = 0;
	const definition = first.definition("hero");
	assert.ok(definition instanceof BaseCharacter);
	definition.stats.strength = 5;
	assert.deepEqual(second.state("hero").classState, {});
	assert.deepEqual(second.state("hero").conditions, []);
	assert.equal(second.state("hero").hitPoints, 50);
	assert.equal(hero.stats.strength, 16);
});
test("Barbarian Rage uses encounter state and constant bonus does not double", () => {
	const raging = fixture([20, 1, 2], { class: new Barbarian([weapon]), level: 1, classState: { raging: true } });
	assert.deepEqual(raging.engine.resolveSingleAttack(raging.request).damage?.byType, { piercing: 8 });
	const calm = fixture([20, 1, 2], { class: raging.hero.characterClass, level: 1 });
	assert.deepEqual(calm.engine.resolveSingleAttack(calm.request).damage?.byType, { piercing: 6 });
});
test("Berserker Frenzy dice use injected RNG and double on crit, flat Rage does not", () => {
	const f = fixture([20, 20, 1, 2, 3, 4, 5, 6], {
		class: new Berserker([weapon]),
		level: 3,
		classState: { raging: true },
	});
	const result = f.engine.resolveSingleAttack(f.request);
	assert.equal(result.damage?.rolledDamage, 26);
	assert.equal(f.roller.remaining, 0);
	assert.equal(
		result.damage?.components.find((component) => component.source === "barbarian.berserker.frenzy")?.dice.length,
		4,
	);
});
test("Zealot Divine Fury keeps chosen type, flat level bonus and injected critical dice", () => {
	const f = fixture([20, 20, 1, 2, 3, 4], {
		class: new Zealot([weapon]),
		level: 3,
		classState: { raging: true, divineFuryType: "necrotic" },
	});
	const result = f.engine.resolveSingleAttack(f.request);
	assert.deepEqual(result.damage?.byType, { piercing: 8, necrotic: 8 });
	assert.equal(f.roller.remaining, 0);
});
test("invalid feats fail; unsupported Push and partial classes report structured limitations", () => {
	assert.throws(
		() =>
			new BaseCharacter(4, new TestAttackClass([weapon]), weapon, "strength", character().stats, 16, 50, [
				{ name: EFeatName.PIERCER },
			]),
		/Invalid ability score/,
	);
	const push = new Weapon(
		"Push test",
		"",
		"martial",
		"common",
		1,
		1,
		"medium",
		[new Dice(8)],
		"bludgeoning",
		EWeaponMastery.PUSH,
	);
	const f = fixture([10, 1]);
	f.encounter.provideWeaponInstance("hero", { id: "push", weapon: push });
	const result = f.engine.resolveSingleAttack({
		...f.request,
		weaponInstanceId: "push",
		weapon: push,
		equip: { kind: "draw", hand: "right", when: "before", weaponInstanceId: "push" },
	});
	assert.ok(result.limitations.some((limitation) => limitation.includes("Push")));
	const ram = fixture([10, 1], { class: new WildHeart([weapon]), level: 1 });
	assert.ok(ram.engine.resolveSingleAttack(ram.request).limitations.includes("Wild Heart Ram"));
});
test("incapacitated actors cannot spend bonus actions or resolve attacks", () => {
	const f = fixture([]);
	f.encounter.state("hero").conditions.push({ name: "incapacitated" });
	assert.deepEqual(f.engine.resolveAttackAction("hero", "enemy"), { totalDamage: 0, attacks: [] });
	assert.throws(
		() => f.engine.resolveSingleAttack({ ...f.request, actionSource: "bonus-action" }),
		/cannot take actions/,
	);
	assert.equal(f.encounter.canUseBonusAction("hero"), true);
});
test("selected weapon category/reach are independent of distance and ranged mode", () => {
	const f = fixture([]);
	assert.equal(f.engine.isAttackLegal({ ...f.request, weapon, distance: 10 }), false);
	const reach = new Weapon("Reach", "", "martial", "common", 1, 1, "large", [new Dice(10)], "slashing", undefined, {
		category: "melee",
		properties: ["reach", "heavy"],
		reach: 10,
	});
	f.encounter.provideWeaponInstance("hero", { id: "reach", weapon: reach });
	const selected = {
		...f.request,
		weapon: reach,
		weaponInstanceId: "reach",
		equip: { kind: "draw" as const, hand: "right" as const, when: "before" as const, weaponInstanceId: "reach" },
	};
	assert.equal(f.engine.isAttackLegal({ ...selected, distance: 10 }), true);
	assert.equal(f.engine.isAttackLegal({ ...selected, mode: "ranged" }), false);
});

test("Hew retargeting uses scenario geometry, stable live targets, and validated target choices", () => {
	const encounter = new EncounterState([
		{ id: "hero", definition: character() },
		{ id: "near", definition: new BaseMonster("Near", 12, 1) },
		{ id: "far", definition: new BaseMonster("Far", 12, 50) },
		{ id: "next", definition: new BaseMonster("Next", 12, 50) },
	]);
	encounter.beginTurn("hero");
	const engine = new CombatEngine(encounter, {
		roller: new FixedDiceRoller([10, 1, 10, 2]),
		distanceFor: (_actor, target) => (target === "far" ? 30 : 5),
		hooks: [
			{
				id: "choose-target",
				afterAttack: (ctx, result) => {
					if (!result.damage?.hp.reducedToZero || !ctx.encounter.canUseBonusAction(ctx.request.actorId)) return [];
					const targetId = ctx.chooseHewTarget();
					return targetId === null ? [] : [{ targetId, source: "test.hew" }];
				},
			},
		],
	});
	const result = engine.resolveSingleAttack({
		actorId: "hero",
		targetId: "near",
		mode: "melee",
		actionSource: "attack-action",
	});
	assert.equal(result.triggeredAttacks[0]?.targetId, "next");
	assert.equal(encounter.state("far").hitPoints, 50);
});

test("declined immediate bonus attack cannot be retained; custom invalid target is rejected", () => {
	const hook: CombatHook = {
		id: "declined",
		afterAttack: (ctx, result) => {
			if (!result.hit.isCrit || !ctx.encounter.canUseBonusAction(ctx.request.actorId)) return [];
			const targetId = ctx.chooseHewTarget();
			return targetId === null ? [] : [{ targetId, source: "test.hew" }];
		},
	};
	const f = fixture([20, 1, 1, 10, 1], { hooks: [hook], strategy: { chooseHewTarget: () => null } });
	assert.deepEqual(f.engine.resolveSingleAttack(f.request).triggeredAttacks, []);
	assert.deepEqual(f.engine.resolveSingleAttack(f.request).triggeredAttacks, []);
	assert.equal(f.encounter.canUseBonusAction("hero"), true);
	const bad = fixture([20, 1, 1], { hooks: [hook], strategy: { chooseHewTarget: () => "unseen" } });
	assert.throws(() => bad.engine.resolveSingleAttack(bad.request), /Invalid Hew target/);
});

test("Brutal Strike dice use encounter RNG and keep all critical copies", () => {
	const f = fixture([20, 1, 2, 3, 4, 5, 6], { class: new Barbarian([weapon]), level: 17 });
	const result = f.engine.resolveSingleAttack(f.request);
	assert.equal(result.damage?.rolledDamage, 24);
	const component = result.damage?.components.find((entry) => entry.source === "barbarian.brutal-strike");
	assert.deepEqual(
		component?.dice.map((die) => die.provenance),
		["base", "critical-copy", "base", "critical-copy"],
	);
	assert.equal(f.roller.remaining, 0);
});

test("encounters detach the whole weapon/class graph from the build and each other", () => {
	const originalWeapon = new Weapon(
		"Isolated weapon",
		"",
		"martial",
		"common",
		0,
		0,
		"medium",
		[new Dice(6)],
		"slashing",
		undefined,
		{ category: "melee", properties: ["heavy", "two-handed"], range: { normal: 20, long: 60 } },
	);
	const original = new BaseCharacter(
		4,
		new BaseClass([originalWeapon]),
		originalWeapon,
		"strength",
		{
			strength: 10,
			dexterity: 10,
			constitution: 10,
			intelligence: 10,
			wisdom: 10,
			charisma: 10,
		},
		16,
		50,
	);
	const create = () =>
		new EncounterState([
			{ id: "hero", definition: original },
			{ id: "target", definition: new BaseMonster("Target", 10, 50) },
		]);
	const first = create();
	const second = create();
	const a = first.definition("hero");
	const b = second.definition("hero");
	assert.ok(a instanceof BaseCharacter);
	assert.ok(b instanceof BaseCharacter);
	assert.notEqual(a.weapon, original.weapon);
	assert.notEqual(a.weapon, b.weapon);
	assert.notEqual(a.weapon.damage[0], b.weapon.damage[0]);
	assert.notEqual(a.weapon.properties, b.weapon.properties);
	assert.notEqual(a.weapon.properties, original.weapon.properties);
	assert.notEqual(a.weapon.range, b.weapon.range);
	assert.equal(Object.isFrozen(a.weapon.properties), true);
	assert.equal(Object.isFrozen(a.weapon.range), true);
	assert.throws(() => Reflect.apply(Array.prototype.push, a.weapon.properties, ["light"]), TypeError);
	assert.notEqual(a.characterClass, b.characterClass);
	assert.notEqual(a.characterClass.weaponProficiencies, b.characterClass.weaponProficiencies);
	// Keep identity *inside* a single detached graph, so proficiency still works.
	assert.equal(a.characterClass.weaponProficiencies[0], a.weapon);
	a.weapon.damage.push(new Dice(6));
	a.weapon.damageType = "fire";
	const firstDie = a.weapon.damage[0];
	assert.ok(firstDie);
	Object.defineProperty(firstDie, "maxValue", { value: 12 });
	Object.defineProperty(a.weapon, "category", { value: "ranged" });
	const aProficiency = a.characterClass.weaponProficiencies[0];
	assert.ok(aProficiency);
	aProficiency.name = "Changed first encounter";
	Reflect.apply(Array.prototype.push, a.characterClass.weaponProficiencies, [weapon]);
	assert.equal(a.characterClass.weaponProficiencies.length, 2);
	assert.equal(original.characterClass.weaponProficiencies.length, 1);
	assert.equal(b.characterClass.weaponProficiencies.length, 1);
	assert.equal(original.weapon.damage[0]?.maxValue, 6);
	assert.equal(original.weapon.damage.length, 1);
	assert.equal(original.weapon.damageType, "slashing");
	assert.equal(original.weapon.name, "Isolated weapon");
	assert.equal(b.weapon.damage[0]?.maxValue, 6);
	assert.equal(b.weapon.category, "melee");
	assert.deepEqual(b.weapon.properties, ["heavy", "two-handed"]);
	assert.equal(b.weapon.damage.length, 1);
	assert.equal(b.weapon.damageType, "slashing");
	assert.equal(b.weapon.name, "Isolated weapon");
	// Original definition changes after construction must not leak into either encounter.
	original.weapon.damage.push(new Dice(8));
	original.weapon.damageType = "cold";
	Object.defineProperty(original.weapon, "reach", { value: 15 });
	const originalDie = original.weapon.damage[0];
	assert.ok(originalDie);
	Object.defineProperty(originalDie, "maxValue", { value: 20 });
	const originalProficiency = original.characterClass.weaponProficiencies[0];
	assert.ok(originalProficiency);
	originalProficiency.name = "Changed original build";
	Reflect.apply(Array.prototype.push, original.characterClass.weaponProficiencies, [weapon]);
	assert.equal(original.characterClass.weaponProficiencies.length, 2);
	assert.equal(a.characterClass.weaponProficiencies.length, 2);
	assert.equal(b.characterClass.weaponProficiencies.length, 1);
	assert.equal(a.weapon.damage.length, 2);
	assert.equal(a.weapon.damageType, "fire");
	assert.equal(a.weapon.name, "Changed first encounter");
	assert.equal(b.weapon.damage[0]?.maxValue, 6);
	assert.equal(b.weapon.category, "melee");
	assert.deepEqual(b.weapon.properties, ["heavy", "two-handed"]);
	assert.equal(b.weapon.damage.length, 1);
	assert.equal(b.weapon.damageType, "slashing");
	assert.equal(b.weapon.reach, 5);
	assert.equal(b.characterClass.isProficientWithWeapon(b.weapon), true);
	second.beginTurn("hero");
	const roller = new FixedDiceRoller([
		{ sides: 20, value: 10 },
		{ sides: 20, value: 10 },
		{ sides: 6, value: 3 },
	]);
	const result = new CombatEngine(second, { roller }).resolveSingleAttack({
		actorId: "hero",
		targetId: "target",
		mode: "melee",
		actionSource: "attack-action",
	});
	assert.deepEqual(result.damage?.byType, { slashing: 3 });
	assert.equal(result.hit.totalAttackRoll, 12);
	assert.equal(roller.remaining, 0);
});
