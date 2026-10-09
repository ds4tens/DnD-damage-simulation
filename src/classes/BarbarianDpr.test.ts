import assert from "node:assert/strict";
import test from "node:test";
import BaseCharacter, { defaultStatBlock } from "../character/BaseCharacter.ts";
import { CombatEngine } from "../combat/AttackResolver.ts";
import type { CombatantInput } from "../combat/CombatTypes.ts";
import { EncounterState } from "../combat/EncounterState.ts";
import type { CombatStrategy } from "../combat/Strategy.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { Battleaxe, Dagger, Glaive, Handaxe, Javelin, Longbow } from "../Items/Weapon/WeaponList.ts";
import type Weapon from "../Items/Weapon.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import Barbarian, { persistentRageResourceId, rageResourceId } from "./Barbarian.ts";
import Berserker from "./BarbarianSubclasses/Berserker.ts";
import WildHeart from "./BarbarianSubclasses/WildHeart.ts";
import WorldTree from "./BarbarianSubclasses/WorldTree.ts";
import Zealot from "./BarbarianSubclasses/Zealot.ts";

function fixture(
	rolls: number[],
	options: {
		level?: number;
		characterClass?: Barbarian;
		weapon?: Weapon;
		strategy?: Partial<CombatStrategy>;
		heavyArmor?: boolean;
		targetSize?: CombatantInput["size"];
		distance?: number;
		masteries?: Weapon[];
		classState?: CombatantInput["initialClassState"];
		resources?: CombatantInput["initialResources"];
	} = {},
) {
	const weapon = options.weapon ?? Dagger;
	const hero = new BaseCharacter(
		options.level ?? 3,
		options.characterClass ?? new Barbarian([Dagger, Battleaxe, Glaive, Javelin, Longbow, Handaxe]),
		weapon,
		"strength",
		{ ...defaultStatBlock, strength: 16, dexterity: 16 },
		16,
		80,
		[],
		{ armorCategory: options.heavyArmor ? "heavy" : "none" },
	);
	const encounter = new EncounterState([
		{
			id: "hero",
			definition: hero,
			...(options.classState ? { initialClassState: options.classState } : {}),
			...(options.resources ? { initialResources: options.resources } : {}),
			masteredWeaponNames: options.masteries?.map((item) => item.name) ?? [],
		},
		{
			id: "target",
			definition: new BaseMonster("Target", 12, 100),
			hitPointMode: "inexhaustible",
			...(options.targetSize ? { size: options.targetSize } : {}),
		},
	]);
	const roller = new FixedDiceRoller(rolls);
	const engine = new CombatEngine(encounter, {
		roller,
		strategy: { useFeature: (_snapshot, id) => id !== "barbarian.brutal-strike", ...options.strategy },
		distanceFor: () => options.distance ?? (options.weapon === Javelin ? 10 : 5),
	});
	return {
		hero,
		encounter,
		roller,
		engine,
		attack: (extra: { mode?: "melee" | "ranged" | "thrown"; ability?: "strength" | "dexterity" } = {}) =>
			engine.resolveSingleAttack({
				actorId: "hero",
				targetId: "target",
				actionSource: "attack-action",
				weapon,
				mode: "melee",
				...extra,
			}),
	};
}
function nextOwnTurn(f: ReturnType<typeof fixture>): void {
	f.engine.endTurn();
	f.engine.beginTurn("target");
	f.engine.endTurn();
	f.engine.beginTurn("hero");
}

test("Rage progression changes at the 2024 table boundaries", () => {
	const definition = new Barbarian([]);
	assert.deepEqual(
		[1, 3, 6, 12, 17].map((level) => definition.getResourceDefinitions(level)[0]?.maxUses),
		[2, 3, 4, 5, 6],
	);
	assert.deepEqual(
		[8, 9, 15, 16].map((level) => definition.getRageDamageBonus(level)),
		[2, 3, 3, 4],
	);
	assert.deepEqual(
		[4, 5].map((level) => definition.getAttackCount(level)),
		[1, 2],
	);
	assert.deepEqual(
		[3, 4, 9, 10].map((level) => definition.getWeaponMasteryCount(level)),
		[2, 3, 3, 4],
	);
});

test("Rage activation spends one Bonus Action/use; strategy can decline and heavy armor forbids it", () => {
	const active = fixture([]);
	active.engine.beginTurn("hero");
	assert.equal(active.engine.resolveFeatureActions("hero", "before-attack")[0]?.featureId, "barbarian.rage.activate");
	assert.equal(active.encounter.state("hero").classState.raging, true);
	assert.equal(active.encounter.resourceRemaining("hero", rageResourceId), 2);
	assert.equal(active.encounter.canUseBonusAction("hero"), false);
	assert.deepEqual(active.engine.resolveFeatureActions("hero", "before-attack"), []);
	const decline = fixture([], { strategy: { chooseFeatureAction: () => null } });
	decline.engine.beginTurn("hero");
	assert.deepEqual(decline.engine.resolveFeatureActions("hero", "before-attack"), []);
	assert.equal(decline.encounter.resourceRemaining("hero", rageResourceId), 3);
	const heavy = fixture([], { heavyArmor: true });
	heavy.engine.beginTurn("hero");
	assert.deepEqual(heavy.engine.resolveFeatureActions("hero", "before-attack"), []);
	assert.equal(heavy.encounter.canUseBonusAction("hero"), true);
});

test("a hostile missed attack extends Rage; inactivity expires at the next own end", () => {
	const f = fixture([1, 1]);
	f.engine.beginTurn("hero");
	f.engine.resolveFeatureActions("hero", "before-attack");
	nextOwnTurn(f);
	assert.equal(f.attack().hit.isHit, false);
	f.engine.endTurn();
	assert.equal(f.encounter.state("hero").classState.raging, true);
	f.engine.beginTurn("hero");
	f.engine.endTurn();
	assert.equal(f.encounter.state("hero").classState.raging, false);
	assert.equal(f.roller.remaining, 0);
});

test("Rage can extend with Bonus Action and ends on incapacity or ten-minute gap", () => {
	const f = fixture([]);
	f.engine.beginTurn("hero");
	f.engine.resolveFeatureActions("hero", "before-attack");
	nextOwnTurn(f);
	assert.equal(f.engine.resolveFeatureActions("hero", "after-attack")[0]?.featureId, "barbarian.rage.extend");
	assert.equal(f.encounter.canUseBonusAction("hero"), false);
	f.engine.endTurn();
	f.engine.advanceElapsedTime(10);
	assert.equal(f.encounter.state("hero").classState.raging, false);
	const incap = fixture([]);
	incap.engine.beginTurn("hero");
	incap.engine.resolveFeatureActions("hero", "before-attack");
	incap.encounter.state("hero").conditions.push({ name: "stunned" });
	incap.engine.endTurn();
	assert.equal(incap.encounter.state("hero").classState.raging, false);
});

test("Strength thrown attacks receive Rage and Reckless; Dexterity attacks do not", () => {
	const thrown = fixture([10, 12, 2], { weapon: Javelin });
	thrown.engine.beginTurn("hero");
	thrown.engine.resolveFeatureActions("hero", "before-attack");
	const attack = thrown.attack({ mode: "thrown" });
	assert.deepEqual(attack.hit.d20Rolls, [10, 12]);
	assert.equal(attack.damage?.byType.piercing, 7);
	const dex = fixture([12, 2]);
	dex.engine.beginTurn("hero");
	dex.engine.resolveFeatureActions("hero", "before-attack");
	const dexAttack = dex.attack({ ability: "dexterity" });
	assert.deepEqual(dexAttack.hit.d20Rolls, [12]);
	assert.equal(
		dexAttack.damage?.components.some((component) => component.id === rageResourceId),
		false,
	);
});

test("Reckless can be declared at first Dexterity roll and affects later Strength attacks", () => {
	const f = fixture([12, 2, 10, 12, 2], { level: 5 });
	f.engine.beginTurn("hero");
	const action = f.engine.beginAttackAction("hero");
	const first = f.engine.attackInAction(action, {
		targetId: "target",
		mode: "melee",
		weapon: Dagger,
		ability: "dexterity",
	});
	const second = f.engine.attackInAction(action, {
		targetId: "target",
		mode: "melee",
		weapon: Dagger,
		ability: "strength",
		distance: 10,
	});
	assert.deepEqual(first.hit.d20Rolls, [12]);
	assert.deepEqual(second.hit.d20Rolls, [10, 12]);
	assert.equal(
		second.decisions.some((decision) => decision.feature === "barbarian.reckless-attack"),
		false,
	);
});

test("declining Reckless first roll cannot activate it on the second; incoming Advantage expires next start", () => {
	const no = fixture([12, 2, 12, 2], { level: 5, strategy: { useFeature: () => false } });
	no.engine.beginTurn("hero");
	const hits = no.engine.resolveAttackAction("hero", "target").attacks;
	assert.deepEqual(
		hits.map((hit) => hit.hit.d20Rolls.length),
		[1, 1],
	);
	const yes = fixture([12, 10, 2, 5, 20]);
	yes.engine.beginTurn("hero");
	yes.attack();
	yes.engine.endTurn();
	yes.engine.beginTurn("target");
	const incoming = yes.engine.resolveSingleAttack({
		actorId: "target",
		targetId: "hero",
		actionSource: "attack-action",
		mode: "melee",
		profile: { attackBonus: 0, damage: [] },
		distance: 30,
	});
	assert.deepEqual(incoming.hit.d20Rolls, [5, 20]);
	yes.engine.endTurn();
	yes.engine.beginTurn("hero");
	assert.equal(yes.encounter.state("hero").barbarian?.recklessExpiresOwnTurn, yes.encounter.state("hero").ownTurnCount);
});

test("Brutal Strike is selectable on the second attack, forfeits all Advantage and is spent on miss", () => {
	const f = fixture([10, 12, 2, 1], {
		level: 9,
		strategy: { useFeature: (snapshot, id) => id !== "barbarian.brutal-strike" || snapshot.attackIndexInTurn === 1 },
	});
	f.engine.beginTurn("hero");
	const attacks = f.engine.resolveAttackAction("hero", "target").attacks;
	assert.deepEqual(
		attacks.map((attack) => attack.hit.d20Rolls.length),
		[2, 1],
	);
	assert.equal(attacks[1]?.hit.isHit, false);
	assert.equal(f.encounter.hasUsed("hero", "barbarian.brutal-strike"), true);
	assert.equal(f.encounter.effectsOn("target").length, 0);
	assert.equal(f.roller.remaining, 0);
});

test("Brutal Strike cannot be used with any Disadvantage even when Advantage cancels it", () => {
	const f = fixture([12, 2], { level: 9, strategy: { useFeature: () => true } });
	f.engine.beginTurn("hero");
	f.encounter.state("hero").conditions.push({ name: "poisoned" });
	const attack = f.attack();
	assert.deepEqual(attack.hit.d20Rolls, [12]);
	assert.equal(
		attack.damage?.components.some((component) => component.id === "barbarian.brutal-strike"),
		false,
	);
	assert.equal(f.encounter.hasUsed("hero", "barbarian.brutal-strike"), false);
});

test("level17 Brutal Strike doubles both d10 on crit and selects two distinct effects", () => {
	const f = fixture([20, 1, 2, 3, 4, 5, 6], { level: 17, strategy: { useFeature: () => true } });
	f.engine.beginTurn("hero");
	const attack = f.attack();
	assert.equal(attack.damage?.rolledDamage, 24);
	assert.deepEqual(
		attack.damage?.components
			.find((component) => component.id === "barbarian.brutal-strike")
			?.dice.map((die) => die.provenance),
		["base", "critical-copy", "base", "critical-copy"],
	);
	assert.deepEqual(
		f.encounter.effectsOn("target").map((effect) => effect.kind),
		["barbarian.staggering-blow", "barbarian.hamstring-blow"],
	);
});

test("Staggering Blow affects the same-hit Topple once; the following save is normal", () => {
	const f = fixture([12, 2, 3, 18, 1, 18], {
		level: 13,
		weapon: Battleaxe,
		masteries: [Battleaxe],
		strategy: { useFeature: () => true },
	});
	f.engine.beginTurn("hero");
	const attack = f.attack();
	assert.deepEqual(attack.savingThrows?.[0]?.d20Rolls, [18, 1]);
	assert.equal(attack.savingThrows?.[0]?.success, false);
	assert.equal(
		f.encounter.state("target").conditions.some((condition) => condition.name === "prone"),
		true,
	);
	const next = f.engine.resolveSavingThrow({ targetId: "target", ability: "constitution", dc: 16, source: "next" });
	assert.deepEqual(next.d20Rolls, [18]);
});

test("Hamstring stacks with distinct speed reductions and prevents a passive target from standing", () => {
	const f = fixture([12, 2, 3], { level: 9, strategy: { useFeature: () => true } });
	f.engine.beginTurn("hero");
	f.attack();
	f.encounter.addEffect({
		kind: "weaponMastery.slow",
		sourceId: "hero",
		targetId: "target",
		expires: "start-of-source-next-turn",
		speedReduction: 10,
	});
	f.encounter.addEffect({
		kind: "slasher.hamstring",
		sourceId: "hero",
		targetId: "target",
		expires: "start-of-source-next-turn",
		speedReduction: 10,
	});
	f.encounter.state("target").conditions.push({ name: "prone" });
	f.engine.endTurn();
	f.engine.beginTurn("target");
	assert.equal(f.encounter.snapshot("target").speed, 0);
	assert.equal(f.engine.standUp("target"), false);
	f.engine.endTurn();
	f.engine.beginTurn("hero");
	assert.equal(f.encounter.effectiveSpeed("target"), 30);
});

test("Frenzy waits for the first eligible Strength hit and supports Strength thrown attacks", () => {
	const f = fixture([12, 2, 12, 2, 3, 4], { level: 5, characterClass: new Berserker([Dagger]) });
	f.engine.beginTurn("hero");
	f.engine.resolveFeatureActions("hero", "before-attack");
	const action = f.engine.beginAttackAction("hero");
	const first = f.engine.attackInAction(action, {
		targetId: "target",
		mode: "melee",
		weapon: Dagger,
		ability: "dexterity",
	});
	const second = f.engine.attackInAction(action, {
		targetId: "target",
		mode: "thrown",
		weapon: Dagger,
		ability: "strength",
		distance: 10,
	});
	assert.equal(
		first.damage?.components.some((component) => component.id.includes("frenzy")),
		false,
	);
	assert.deepEqual(
		second.damage?.components.find((component) => component.id.includes("frenzy"))?.dice.map((die) => die.value),
		[3, 4],
	);
	assert.equal(f.roller.remaining, 0);
});

test("Divine Fury works on Dexterity weapon hit and Unarmed; damage type is a strategy choice", () => {
	const f = fixture([12, 2, 4], {
		characterClass: new Zealot([Dagger]),
		strategy: {
			chooseFeatureOption: (_snapshot, id, candidates) =>
				id === "barbarian.zealot.divine-fury.type" ? "necrotic" : (candidates[0] ?? null),
		},
	});
	f.engine.beginTurn("hero");
	f.engine.resolveFeatureActions("hero", "before-attack");
	const attack = f.attack({ ability: "dexterity" });
	assert.deepEqual(attack.damage?.byType, { piercing: 5, necrotic: 5 });
	const unarmed = fixture([12, 10, 4], { characterClass: new Zealot([Dagger]) });
	unarmed.engine.beginTurn("hero");
	unarmed.engine.resolveFeatureActions("hero", "before-attack");
	const strike = unarmed.engine.resolveAttackAction("hero", "target", { unarmed: true }).attacks[0];
	assert.deepEqual(strike?.damage?.byType, { bludgeoning: 6, radiant: 5 });
});

test("Ram requires an activated level14 Rage, melee hit, optional choice and Large-or-smaller target", () => {
	for (const [size, accept, prone] of [
		["large", true, true],
		["huge", true, false],
		["large", false, false],
	] as const) {
		const f = fixture([12, 10, 2], {
			level: 14,
			characterClass: new WildHeart([Dagger]),
			targetSize: size,
			strategy: {
				useFeature: (_snapshot, id) =>
					id === "barbarian.reckless-attack" || (id === "barbarian.wild-heart.ram" && accept),
			},
		});
		f.engine.beginTurn("hero");
		f.engine.resolveFeatureActions("hero", "before-attack");
		const attack = f.attack();
		assert.equal(
			f.encounter.state("target").conditions.some((condition) => condition.name === "prone"),
			prone,
		);
		assert.equal(attack.savingThrows, undefined);
	}
});

test("Battering Roots grants own-turn reach and extra Topple without duplicating selected Topple", () => {
	const reach = fixture([12, 10, 2, 1], {
		level: 10,
		characterClass: new WorldTree([Glaive]),
		weapon: Glaive,
		distance: 20,
	});
	reach.engine.beginTurn("hero");
	const attack = reach.attack();
	assert.equal(attack.savingThrows?.[0]?.source, "barbarian.world-tree.topple");
	assert.equal(
		reach.encounter.state("target").conditions.some((condition) => condition.name === "prone"),
		true,
	);
	const base = fixture([12, 10, 2, 1], {
		level: 10,
		characterClass: new WorldTree([Battleaxe]),
		weapon: Battleaxe,
		masteries: [Battleaxe],
	});
	base.engine.beginTurn("hero");
	assert.equal(base.attack().savingThrows?.length, 1);
	const outside = fixture([], { level: 10, characterClass: new WorldTree([Glaive]), weapon: Glaive, distance: 20 });
	outside.engine.beginTurn("target");
	assert.equal(
		outside.engine.isAttackLegal({
			actorId: "hero",
			targetId: "target",
			actionSource: "reaction",
			mode: "melee",
			weapon: Glaive,
		}),
		false,
	);
});

test("Persistent Rage survives inactivity and stunned but ends unconscious; Initiative refill is once per Long Rest", () => {
	const f = fixture([10, 10, 8], { level: 15, resources: { [rageResourceId]: 0, [persistentRageResourceId]: 1 } });
	f.engine.createScheduler();
	assert.equal(f.encounter.resourceRemaining("hero", rageResourceId), 5);
	assert.equal(f.encounter.resourceRemaining("hero", persistentRageResourceId), 0);
	assert.equal(f.encounter.resourceSpentSnapshot("hero")[persistentRageResourceId], 1);
	const explicit = fixture([], { level: 15, resources: { [rageResourceId]: 0, [persistentRageResourceId]: 1 } });
	explicit.engine.createScheduler({ order: ["hero", "target"] });
	assert.equal(explicit.encounter.resourceRemaining("hero", rageResourceId), 0);
	const rage = fixture([], { level: 15 });
	rage.engine.beginTurn("hero");
	rage.engine.resolveFeatureActions("hero", "before-attack");
	for (let turn = 0; turn < 3; turn++) nextOwnTurn(rage);
	rage.encounter.state("hero").conditions.push({ name: "stunned" });
	rage.engine.endTurn();
	assert.equal(rage.encounter.state("hero").classState.raging, true);
	rage.encounter.state("hero").conditions.push({ name: "unconscious" });
	rage.engine.beginTurn("hero");
	assert.equal(rage.encounter.state("hero").classState.raging, false);
	rage.engine.endTurn();
	rage.engine.recoverResources("hero", "long-rest");
	assert.equal(rage.encounter.resourceRemaining("hero", persistentRageResourceId), 1);
});

test("Rage recovery caps one per Short Rest and all per Long Rest; snapshots exclude active Rage", () => {
	const f = fixture([]);
	f.engine.beginTurn("hero");
	f.engine.resolveFeatureActions("hero", "before-attack");
	f.engine.endTurn();
	const snapshot = f.engine.exportPersistentState("hero");
	assert.equal(snapshot.classState.raging, undefined);
	assert.equal(snapshot.resources[rageResourceId], 2);
	f.engine.recoverResources("hero", "short-rest");
	assert.equal(f.encounter.resourceRemaining("hero", rageResourceId), 3);
	f.engine.recoverResources("hero", "short-rest");
	assert.equal(f.encounter.resourceRemaining("hero", rageResourceId), 3);
	f.encounter.spendResource("hero", rageResourceId, 3);
	f.engine.recoverResources("hero", "long-rest");
	assert.equal(f.encounter.resourceRemaining("hero", rageResourceId), 3);
});

test("a save-based Shove consumes an attack slot without preempting the first Reckless attack-roll decision", () => {
	const f = fixture([1, 10, 12, 2], { level: 5 });
	f.engine.beginTurn("hero");
	f.engine.resolveFeatureActions("hero", "before-attack");
	const action = f.engine.beginAttackAction("hero");
	const shove = f.engine.resolveUnarmedEffectInAction(action, { targetId: "target", effect: "shove-prone" });
	assert.equal(shove.applied, true);
	assert.equal("hit" in shove, false);
	assert.equal(f.encounter.turn.attackRollCounts.get("hero"), undefined);
	const weapon = f.engine.attackInAction(action, { targetId: "target", mode: "melee", weapon: Dagger });
	assert.equal(weapon.attackIndexInTurn, 1);
	assert.deepEqual(weapon.hit.d20Rolls, [10, 12]);
	assert.equal(weapon.decisions.find((decision) => decision.feature === "barbarian.reckless-attack")?.choice, true);
	const result = f.engine.finishAttackAction(action);
	assert.equal(result.unarmedEffects?.length, 1);
	assert.equal(result.attacks.length, 1);
	assert.throws(
		() => f.engine.resolveUnarmedEffectInAction(action, { targetId: "target", effect: "grapple" }),
		/handle/,
	);
});

test("Unarmed save-based effects are explicit strategy choices, validate before RNG and preserve attack-roll result shapes", () => {
	const f = fixture([1, 10, 12, 2], {
		level: 5,
		strategy: {
			chooseUnarmedEffect: (snapshot, candidates) =>
				snapshot.remainingPrimaryAttacks === 2
					? candidates.findIndex((candidate) => candidate.effect === "shove-prone")
					: null,
		},
	});
	f.engine.beginTurn("hero");
	const action = f.engine.resolveAttackAction("hero", "target", { unarmedEffects: true });
	assert.equal(action.unarmedEffects?.[0]?.applied, true);
	assert.equal(action.attacks.length, 1);
	assert.equal(action.attacks[0]?.attackIndexInTurn, 1);
	const huge = fixture([], { level: 5, targetSize: "huge" });
	huge.engine.beginTurn("hero");
	const handle = huge.engine.beginAttackAction("hero");
	assert.throws(
		() => huge.engine.resolveUnarmedEffectInAction(handle, { targetId: "target", effect: "grapple" }),
		/Illegal/,
	);
	assert.equal(huge.roller.remaining, 0);
	const empty = huge.engine.finishAttackAction(handle);
	assert.deepEqual(empty.attacks, []);
	assert.equal(empty.unarmedEffects, undefined);
});

test("Rage dismissal costs a Bonus Action and the default strategy leaves active Rage running", () => {
	const f = fixture([]);
	f.engine.beginTurn("hero");
	f.engine.resolveFeatureActions("hero", "before-attack");
	nextOwnTurn(f);
	assert.deepEqual(f.engine.resolveFeatureActions("hero", "before-attack"), []);
	assert.equal(f.encounter.state("hero").classState.raging, true);
	const dismiss = fixture([], {
		strategy: {
			chooseFeatureAction: (_snapshot, candidates) =>
				candidates.find((candidate) => candidate.id === "barbarian.rage.dismiss")?.id ?? candidates[0]?.id ?? null,
		},
	});
	dismiss.engine.beginTurn("hero");
	dismiss.engine.resolveFeatureActions("hero", "before-attack");
	nextOwnTurn(dismiss);
	assert.equal(dismiss.engine.resolveFeatureActions("hero", "before-attack")[0]?.featureId, "barbarian.rage.dismiss");
	assert.equal(dismiss.encounter.state("hero").classState.raging, false);
	assert.equal(dismiss.encounter.canUseBonusAction("hero"), false);
});

test("Persistent Rage keeps its recovery use when no Rage is expended and ends at the ten-minute maximum", () => {
	const full = fixture([10, 10, 8], { level: 15 });
	full.engine.createScheduler();
	assert.equal(full.encounter.resourceRemaining("hero", persistentRageResourceId), 1);
	const f = fixture([], { level: 15 });
	f.engine.beginTurn("hero");
	f.engine.resolveFeatureActions("hero", "before-attack");
	for (let turn = 0; turn < 100; turn++) {
		f.engine.endTurn();
		f.engine.beginTurn("hero");
	}
	assert.equal(f.encounter.state("hero").classState.raging, false);
});

test("Feral Instinct grants Initiative Advantage at level7 and Surprise cancels it", () => {
	const below = fixture([10, 8], { level: 6 });
	assert.deepEqual(below.engine.createScheduler().initiative.find((entry) => entry.actorId === "hero")?.d20Rolls, [10]);
	const feral = fixture([10, 18, 8], { level: 7 });
	assert.deepEqual(
		feral.engine.createScheduler().initiative.find((entry) => entry.actorId === "hero")?.d20Rolls,
		[10, 18],
	);
	const surprised = fixture([10, 8], { level: 7 });
	assert.deepEqual(
		surprised.engine.createScheduler({ surprisedIds: ["hero"] }).initiative.find((entry) => entry.actorId === "hero")
			?.d20Rolls,
		[10],
	);
});

test("ten-minute gaps expire Rage/Reckless/timed effects and shorter elapsed gaps reject before mutation", () => {
	const f = fixture([10, 12, 2]);
	f.engine.beginTurn("hero");
	f.engine.resolveFeatureActions("hero", "before-attack");
	f.attack();
	f.encounter.addEffect({
		kind: "slow",
		sourceId: "hero",
		targetId: "target",
		expires: "start-of-source-next-turn",
		speedReduction: 10,
	});
	f.engine.endTurn();
	assert.throws(() => f.engine.advanceElapsedTime(5), /at least 10/);
	assert.equal(f.encounter.state("hero").classState.raging, true);
	assert.equal(f.encounter.effectiveSpeed("target"), 20);
	f.engine.advanceElapsedTime(10);
	assert.equal(f.encounter.state("hero").classState.raging, false);
	assert.equal(f.encounter.state("hero").barbarian?.recklessExpiresOwnTurn, undefined);
	assert.equal(f.encounter.effectiveSpeed("target"), 30);
});
