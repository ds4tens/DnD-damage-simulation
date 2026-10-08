import assert from "node:assert/strict";
import test from "node:test";
import BaseCharacter, { defaultStatBlock } from "../character/BaseCharacter.ts";
import BaseClass from "../classes/BaseClass.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { Battleaxe, Dagger, Greataxe, Greatsword, Handaxe, Longsword, Whip } from "../Items/Weapon/WeaponList.ts";
import type Weapon from "../Items/Weapon.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import type { AttackContext, AttackResult } from "./CombatTypes.ts";
import { resolveDamage, rollDamageComponents } from "./DamageResolver.ts";
import { EncounterState } from "./EncounterState.ts";
import { applyDamage } from "./HitPointsResolver.ts";
import { resolveSavingThrow } from "./SavingThrowResolver.ts";
import type { SavingThrowRequest, SavingThrowResult } from "./SavingThrowTypes.ts";
import { hasWeaponMastery, masteryMissComponents, resolveMasteryHit } from "./WeaponMasteryResolver.ts";

class MasteryClass extends BaseClass {
	override canUseWeaponMastery(): boolean {
		return true;
	}
}

function fixture(weapon: Weapon, options: { selected?: boolean; strength?: number; use?: boolean } = {}) {
	const actor = new BaseCharacter(
		1,
		new MasteryClass([weapon]),
		weapon,
		"strength",
		{ ...defaultStatBlock, strength: options.strength ?? 16 },
		16,
		30,
	);
	const encounter = new EncounterState([
		{ id: "hero", definition: actor, masteredWeaponNames: options.selected === false ? [] : [weapon.name] },
		{ id: "first", definition: new BaseMonster("First", 12, 30) },
		{ id: "second", definition: new BaseMonster("Second", 12, 30) },
	]);
	encounter.beginTurn("hero");
	const roller = new FixedDiceRoller([]);
	const ctx: AttackContext = {
		encounter,
		roller,
		damageRoller: roller,
		attacker: actor,
		character: actor,
		attackAbility: "strength",
		target: encounter.definition("first"),
		actorState: encounter.state("hero"),
		targetState: encounter.state("first"),
		request: { actorId: "hero", targetId: "first", actionSource: "attack-action", mode: "melee", weapon },
		weapon,
		attackIndexInTurn: 0,
		hasHitOccurredThisTurn: false,
		decisions: [],
		featureSelections: {},
		isOwnTurn: true,
		hasUsed: (feature) => encounter.hasUsed("hero", feature),
		markUsed: (feature) => encounter.markUsed("hero", feature),
		useFeature: () => options.use ?? true,
		chooseOption: (_feature, candidates) => candidates[0] ?? null,
		resolveSavingThrow: (request) => resolveSavingThrow(encounter, request, roller),
		resolveGrapple: () => undefined,
		dealDamage: (targetId, components) =>
			resolveDamage(encounter, targetId, rollDamageComponents(components, false, roller)),
		d20Mode: (_first, mode) => mode,
		chooseWeaponRoll: () => 0,
		choosePunctureDie: () => null,
		choosePiercerCriticalDie: () => null,
		chooseHewTarget: () => null,
		addEffect: (effect) => encounter.addEffect(effect),
	};
	const result: AttackResult = {
		mode: "melee",
		attackId: "attack-1",
		actorId: "hero",
		targetId: "first",
		turnId: encounter.turn.id,
		actionSource: "attack-action",
		attackOrigin: "primary",
		roundNumber: 1,
		source: "attack",
		attackIndexInTurn: 0,
		hit: { d20Roll: 10, d20Rolls: [10], totalAttackRoll: 15, isHit: true, isCrit: false },
		decisions: [],
		triggeredAttacks: [],
		limitations: [],
	};
	const saveRequests: SavingThrowRequest[] = [];
	const save = (request: SavingThrowRequest): SavingThrowResult => {
		saveRequests.push(request);
		return {
			...request,
			d20Rolls: [11],
			natural: 11,
			bonus: 1,
			total: 12,
			success: 12 >= request.dc,
			outcome: "rolled",
		};
	};
	return { ctx, result, encounter, save, saveRequests };
}

function withDamage(f: ReturnType<typeof fixture>, amount: number) {
	const pool = rollDamageComponents(
		[
			{
				id: "fixture",
				source: "fixture",
				origin: "weapon",
				damageType: "slashing",
				dice: [],
				flatBonus: amount,
				doublesOnCrit: false,
			},
		],
		false,
		f.ctx.roller,
	);
	f.result.damage = {
		components: pool,
		rolledDamage: amount,
		appliedDamage: amount,
		byType: { slashing: amount },
		appliedByType: { slashing: amount },
		hp: applyDamage(f.encounter, "first", amount),
	};
}

test("proficiency does not activate Graze or any other unselected mastery", () => {
	const f = fixture(Greatsword, { selected: false });
	assert.equal(hasWeaponMastery(f.encounter, "hero", Greatsword), false);
	f.ctx.hit = { ...f.result.hit, isHit: false };
	assert.deepEqual(masteryMissComponents(f.ctx), []);
	assert.deepEqual(resolveMasteryHit(f.ctx, f.result, { save: f.save }), {});
	const nick = fixture(Dagger);
	assert.equal(hasWeaponMastery(nick.encounter, "hero", Dagger), true);
	assert.equal(hasWeaponMastery(nick.encounter, "hero", Handaxe), false);
});

test("Graze only contributes the selected attack ability on a miss, supports refusal and minimum zero", () => {
	for (const strength of [16, 8]) {
		const f = fixture(Greatsword, { strength });
		f.ctx.hit = { ...f.result.hit, d20Roll: 1, isHit: false };
		const miss = masteryMissComponents(f.ctx);
		assert.equal(miss[0]?.flatBonus, strength === 16 ? 3 : 0);
		assert.deepEqual(miss[0]?.dice, []);
		assert.equal(miss[0]?.damageType, "slashing");
		assert.equal(miss[0]?.doublesOnCrit, false);
		f.ctx.hit = f.result.hit;
		assert.deepEqual(masteryMissComponents(f.ctx), []);
	}
	const decline = fixture(Greatsword, { use: false });
	decline.ctx.hit = { ...decline.result.hit, isHit: false };
	assert.deepEqual(masteryMissComponents(decline.ctx), []);
});

test("Sap triggers on hit with zero damage, consumes the next victim roll and expires at source start", () => {
	const f = fixture(Longsword, { use: false });
	withDamage(f, 0);
	for (const effect of resolveMasteryHit(f.ctx, f.result, { save: f.save }).effects ?? [])
		f.encounter.addEffect(effect);
	assert.equal(f.encounter.hasAttackDisadvantage("first"), true, "Sap is mandatory");
	f.encounter.consumeAttackEffects("hero", "first");
	assert.equal(f.encounter.hasAttackDisadvantage("first"), true);
	f.encounter.consumeAttackEffects("first", "second");
	assert.equal(f.encounter.hasAttackDisadvantage("first"), false);
	for (const effect of resolveMasteryHit(f.ctx, f.result, { save: f.save }).effects ?? [])
		f.encounter.addEffect(effect);
	f.encounter.endTurn();
	f.encounter.beginTurn("second");
	f.encounter.endTurn();
	f.encounter.beginTurn("hero");
	assert.equal(f.encounter.hasAttackDisadvantage("first"), false);
});

test("Slow needs post-defense damage, caps across hits and stacks with independent Slasher", () => {
	const f = fixture(Whip);
	withDamage(f, 0);
	assert.deepEqual(resolveMasteryHit(f.ctx, f.result, { save: f.save }), {});
	f.encounter.state("first").temporaryHp = 5;
	withDamage(f, 1);
	assert.equal(f.result.damage?.hp.hpLost, 0);
	for (let hit = 0; hit < 2; hit++)
		for (const effect of resolveMasteryHit(f.ctx, f.result, { save: f.save }).effects ?? [])
			f.encounter.addEffect(effect);
	assert.equal(f.encounter.effectiveSpeed("first"), 20);
	f.encounter.addEffect({
		kind: "weaponMastery.slow",
		sourceId: "second",
		targetId: "first",
		expires: "start-of-source-next-turn",
		speedReduction: 10,
	});
	assert.equal(f.encounter.effectiveSpeed("first"), 20);
	f.encounter.addEffect({
		kind: "slasher.hamstring",
		sourceId: "hero",
		targetId: "first",
		expires: "start-of-source-next-turn",
		speedReduction: 10,
	});
	assert.equal(f.encounter.effectiveSpeed("first"), 10);
	const decline = fixture(Whip, { use: false });
	withDamage(decline, 1);
	assert.deepEqual(resolveMasteryHit(decline.ctx, decline.result, { save: decline.save }), {});
});

test("Vex is victim-specific, persists source next start, expires source next end and consumes only matching roll", () => {
	const f = fixture(Handaxe, { use: false });
	withDamage(f, 0);
	assert.deepEqual(resolveMasteryHit(f.ctx, f.result, { save: f.save }), {});
	f.encounter.state("first").temporaryHp = 5;
	withDamage(f, 1);
	for (const effect of resolveMasteryHit(f.ctx, f.result, { save: f.save }).effects ?? [])
		f.encounter.addEffect(effect);
	assert.equal(f.encounter.effectsOn("hero")[0]?.attackAdvantageAgainst, "first");
	f.encounter.consumeAttackEffects("hero", "second");
	assert.equal(f.encounter.effectsOn("hero").length, 1);
	f.encounter.endTurn();
	f.encounter.beginTurn("second");
	f.encounter.endTurn();
	f.encounter.beginTurn("hero");
	assert.equal(f.encounter.effectsOn("hero").length, 1);
	f.encounter.endTurn();
	assert.equal(f.encounter.effectsOn("hero").length, 0);
	f.encounter.beginTurn("hero");
	f.ctx.request.targetId = "second";
	for (const effect of resolveMasteryHit(f.ctx, f.result, { save: f.save }).effects ?? [])
		f.encounter.addEffect(effect);
	f.ctx.request.targetId = "first";
	for (const effect of resolveMasteryHit(f.ctx, f.result, { save: f.save }).effects ?? [])
		f.encounter.addEffect(effect);
	assert.equal(f.encounter.effectsOn("hero").length, 2);
	f.encounter.consumeAttackEffects("hero", "first");
	assert.equal(f.encounter.effectsOn("hero").length, 1);
	assert.equal(f.encounter.effectsOn("hero")[0]?.attackAdvantageAgainst, "second");
});

test("Topple uses CON and the actual selected attack ability plus PB, not damage or AC", () => {
	const f = fixture(Battleaxe);
	withDamage(f, 0);
	const failed = resolveMasteryHit(f.ctx, f.result, { save: f.save });
	assert.deepEqual(f.saveRequests, [
		{ targetId: "first", ability: "constitution", dc: 13, source: "weaponMastery.topple" },
	]);
	assert.deepEqual(failed.addConditions, [{ name: "prone", sourceId: "hero" }]);
	const equal = resolveMasteryHit(f.ctx, f.result, {
		save: (request) => ({
			...request,
			d20Rolls: [12],
			natural: 12,
			bonus: 1,
			total: 13,
			success: true,
			outcome: "rolled",
		}),
	});
	assert.equal(equal.addConditions, undefined);
	const decline = fixture(Battleaxe, { use: false });
	assert.deepEqual(resolveMasteryHit(decline.ctx, decline.result, { save: decline.save }), {});
	assert.equal(decline.saveRequests.length, 0);
});

test("Cleave eligibility is hit-only melee and once per global turn without spending any budget", () => {
	const f = fixture(Greataxe);
	const before = f.encounter.turn.bonusActionAvailable;
	assert.equal(resolveMasteryHit(f.ctx, f.result, { save: f.save }).cleaveEligible, true);
	assert.equal(f.encounter.turn.bonusActionAvailable, before);
	f.ctx.request.mode = "thrown";
	assert.deepEqual(resolveMasteryHit(f.ctx, f.result, { save: f.save }), {});
	f.ctx.request.mode = "melee";
	f.result.hit.isHit = false;
	assert.deepEqual(resolveMasteryHit(f.ctx, f.result, { save: f.save }), {});
	f.result.hit.isHit = true;
	f.ctx.markUsed("weaponMastery.cleave");
	assert.deepEqual(resolveMasteryHit(f.ctx, f.result, { save: f.save }), {});
	f.encounter.endTurn();
	f.encounter.beginTurn("second");
	assert.equal(resolveMasteryHit(f.ctx, f.result, { save: f.save }).cleaveEligible, true);
});
