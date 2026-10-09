import assert from "node:assert/strict";
import test from "node:test";
import BaseClass from "../classes/BaseClass.ts";
import { CombatEngine } from "../combat/AttackResolver.ts";
import type { CombatantInput } from "../combat/CombatTypes.ts";
import { EncounterState } from "../combat/EncounterState.ts";
import type { CombatStrategy } from "../combat/Strategy.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import type { FeatSelection } from "../feats/FeatTypes.ts";
import { Dagger, Greatsword } from "../Items/Weapon/WeaponList.ts";
import type Weapon from "../Items/Weapon.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import BaseCharacter, { defaultStatBlock } from "./BaseCharacter.ts";
import { buildLegalCharacter } from "./CharacterBuild.ts";
import { sampleSelection } from "./CharacterBuildTestFixtures.ts";
import type { SpeciesSelection } from "./Origins.ts";

class TwoAttacks extends BaseClass {
	override getAttackCount() {
		return 2;
	}
	override getWeaponMasteryCount() {
		return 1;
	}
	override canUseWeaponMastery() {
		return true;
	}
}
function fixture(
	species: SpeciesSelection,
	rolls: number[],
	options: {
		strategy?: Partial<CombatStrategy>;
		heroInput?: Partial<CombatantInput>;
		targetInput?: Partial<CombatantInput>;
		target?: BaseMonster;
		weapon?: Weapon;
		feats?: FeatSelection[];
		additionalTargets?: CombatantInput[];
	} = {},
) {
	const build = buildLegalCharacter({ ...sampleSelection(5), species });
	const data = build.character.buildData;
	if (!data) throw new Error("Fixture builder must provide own build data");
	const weapon = options.weapon ?? Dagger;
	const hero = new BaseCharacter(
		5,
		new TwoAttacks([weapon]),
		weapon,
		"strength",
		{ ...defaultStatBlock, strength: 16 },
		16,
		100,
		options.feats ?? [],
		{ buildData: data, defenses: build.character.defenses },
	);
	const encounter = new EncounterState([
		{
			id: "hero",
			definition: hero,
			size: build.combatDefaults.size ?? "medium",
			weapons: [{ id: "weapon", weapon }],
			initialHands: { left: "weapon", right: weapon.properties.includes("two-handed") ? "weapon" : null },
			...options.heroInput,
		},
		{
			id: "target",
			definition: options.target ?? new BaseMonster("Target", 12, 1000),
			hitPointMode: "inexhaustible",
			...options.targetInput,
		},
		...(options.additionalTargets ?? []),
	]);
	const roller = new FixedDiceRoller(rolls);
	const engine = new CombatEngine(encounter, {
		roller,
		distanceFor: () => 5,
		strategy: { useOptionalFeature: (_s, id) => id !== "heroic-inspiration", ...options.strategy },
	});
	return { engine, encounter, roller };
}
test("Goliath Fire's Burn uses PB stock only after dealing attack damage, including critical attack dice", () => {
	const f = fixture({ id: "goliath", ancestry: "fire" }, [20, 2, 3, 4, 5, 12, 4, 6]);
	f.engine.beginTurn("hero");
	const result = f.engine.resolveAttackAction("hero", "target");
	assert.equal(f.encounter.resourceRemaining("hero", "species.goliath.giant-ancestry"), 1);
	assert.equal(result.attacks[0]?.additionalDamage?.[0]?.appliedDamage, 9);
	assert.equal(result.attacks[1]?.additionalDamage?.[0]?.appliedDamage, 6);
	assert.equal(f.engine.damageEvents.length, 4);
	const immune = fixture({ id: "goliath", ancestry: "fire" }, [12, 4, 12, 4], {
		target: new BaseMonster("Immune", 12, 1000, 30, { defenses: { immunities: ["piercing"] } }),
	});
	immune.engine.beginTurn("hero");
	immune.engine.resolveAttackAction("hero", "target");
	assert.equal(immune.encounter.resourceRemaining("hero", "species.goliath.giant-ancestry"), 3);
});
test("Frost's Chill stacks by different effect kind, not repeated uses of the same ancestry", () => {
	const f = fixture({ id: "goliath", ancestry: "frost" }, [12, 4, 3, 12, 4, 3]);
	f.engine.beginTurn("hero");
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
	f.engine.resolveAttackAction("hero", "target");
	assert.equal(f.encounter.effectiveSpeed("target"), 0);
	assert.equal(f.encounter.effectsOn("target").length, 3);
	f.engine.endTurn();
	f.engine.beginTurn("target");
	f.encounter.state("target").conditions.push({ name: "prone" });
	assert.equal(f.engine.standUp("target"), false);
	f.engine.endTurn();
	f.engine.beginTurn("hero");
	assert.equal(f.encounter.effectiveSpeed("target"), 30);
});
test("Hill's Tumble respects Large size limit and Goliath Large Form changes size/speed using one Bonus Action", () => {
	const big = fixture({ id: "goliath", ancestry: "hill" }, [12, 4, 12, 4], { targetInput: { size: "huge" } });
	big.engine.beginTurn("hero");
	big.engine.resolveAttackAction("hero", "target");
	assert.equal(big.encounter.state("target").conditions.length, 0);
	assert.equal(big.encounter.resourceRemaining("hero", "species.goliath.giant-ancestry"), 3);
	const f = fixture({ id: "goliath", ancestry: "hill" }, []);
	f.engine.beginTurn("hero");
	f.engine.resolveFeatureActions("hero", "before-attack");
	assert.equal(f.encounter.snapshot("hero").size, "large");
	assert.equal(f.encounter.effectiveSpeed("hero"), 40);
	assert.equal(f.encounter.canUseBonusAction("hero"), false);
	assert.equal(f.encounter.resourceRemaining("hero", "species.goliath.large-form"), 0);
});
test("Aasimar chooses form, deals once-own-turn attack bonus plus independent self/target aura with resistance", () => {
	const f = fixture({ id: "aasimar" }, [12, 4, 12, 4]);
	f.engine.beginTurn("hero");
	f.engine.resolveFeatureActions("hero", "before-attack");
	const result = f.engine.resolveAttackAction("hero", "target");
	assert.equal(result.attacks[0]?.additionalDamage?.[0]?.appliedDamage, 3);
	assert.equal(result.attacks[1]?.additionalDamage?.length ?? 0, 0);
	f.engine.endTurn();
	const aura = f.engine.damageEvents.filter((event) => event.source.includes("inner-radiance"));
	assert.equal(aura.find((event) => event.targetId === "target")?.result.appliedDamage, 3);
	assert.equal(aura.find((event) => event.targetId === "hero")?.result.appliedDamage, 1);
	assert.equal(f.encounter.state("hero").hitPoints, 99);
	assert.equal(f.encounter.resourceRemaining("hero", "species.aasimar.celestial-revelation"), 0);
});
test("Aasimar ten-turn duration counts own turns and does not restore the daily transformation", () => {
	const f = fixture({ id: "aasimar" }, [], {
		strategy: {
			chooseFeatureOption: (_s, id, c) =>
				id === "aasimar.celestial-revelation.form" ? "heavenly-wings" : (c[0] ?? null),
		},
	});
	for (let turn = 1; turn <= 10; turn++) {
		f.engine.beginTurn("hero");
		if (turn === 1) f.engine.resolveFeatureActions("hero", "before-attack");
		assert.equal(f.encounter.state("hero").classState["species.aasimar.celestial-revelation.active"], true);
		f.engine.endTurn();
		if (turn < 10) {
			f.engine.beginTurn("target");
			f.engine.endTurn();
		}
	}
	assert.equal(f.encounter.state("hero").classState["species.aasimar.celestial-revelation.active"], false);
	f.engine.recoverResources("hero", "short-rest");
	assert.equal(f.encounter.resourceRemaining("hero", "species.aasimar.celestial-revelation"), 0);
	f.engine.recoverResources("hero", "long-rest");
	assert.equal(f.encounter.resourceRemaining("hero", "species.aasimar.celestial-revelation"), 1);
});

test("Fire rider supports the current Piercer window and Savage Attacker excludes ancestry dice", () => {
	const piercer = fixture({ id: "goliath", ancestry: "fire" }, [12, 4, 1, 9, 12, 4], {
		feats: [{ name: "piercer", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] }],
		heroInput: { initialResources: { "species.goliath.giant-ancestry": 1 } },
	});
	piercer.engine.beginTurn("hero");
	const result = piercer.engine.resolveAttackAction("hero", "target");
	assert.equal(result.attacks[0]?.additionalDamage?.[0]?.appliedDamage, 9);
	assert.equal(result.attacks[0]?.additionalDamage?.[0]?.components[0]?.dice[0]?.rerolledFrom, 1);
	assert.equal(piercer.roller.remaining, 0);
	const savage = fixture({ id: "goliath", ancestry: "fire" }, [12, 4, 2, 1, 12, 4], {
		feats: [{ name: "savage-attacker" }],
		heroInput: { initialResources: { "species.goliath.giant-ancestry": 1 } },
	});
	savage.engine.beginTurn("hero");
	const attack = savage.engine.resolveAttackAction("hero", "target").attacks[0];
	assert.equal(attack?.damage?.appliedDamage, 7);
	assert.equal(attack?.additionalDamage?.[0]?.appliedDamage, 1);
	assert.equal(savage.roller.remaining, 0);
});

test("Fire and Frost melee attack rider kills trigger Hew before any ordered afterAttack hooks", () => {
	for (const ancestry of ["fire", "frost"] as const) {
		const f = fixture({ id: "goliath", ancestry }, [12, 4, 4, 12, 4], {
			feats: [{ name: "great-weapon-master", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] }],
			heroInput: { initialResources: { "species.goliath.giant-ancestry": 1 } },
			target: new BaseMonster("Finite", 12, 10),
			targetInput: { hitPointMode: "finite" },
			additionalTargets: [
				{ id: "secondary", definition: new BaseMonster("Secondary", 12, 1000), hitPointMode: "inexhaustible" },
			],
			strategy: { orderTriggers: (_s, ids) => [...ids].reverse() },
		});
		f.engine.beginTurn("hero");
		const action = f.engine.beginAttackAction("hero");
		const attack = f.engine.attackInAction(action, { targetId: "target", weaponInstanceId: "weapon", mode: "melee" });
		assert.equal(attack.damage?.hp.reducedToZero, false);
		assert.equal(attack.attackDamageReducedToZero, true);
		assert.equal(attack.triggeredAttacks[0]?.attackOrigin, "hew");
		assert.equal(attack.triggeredAttacks[0]?.targetId, "secondary");
		assert.equal(f.engine.damageEvents.length, 3);
		assert.equal(f.roller.remaining, 0);
	}
});

test("Aasimar damage on a Graze miss can kill with a melee weapon and trigger Hew", () => {
	const f = fixture({ id: "aasimar" }, [1, 12, 4, 5], {
		weapon: Greatsword,
		feats: [{ name: "great-weapon-master", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] }],
		heroInput: {
			masteredWeaponIds: ["greatsword"],
			initialHands: { left: "weapon", right: "weapon" },
			initialClassState: {
				"species.aasimar.celestial-revelation.active": true,
				"species.aasimar.celestial-revelation.form": "heavenly-wings",
				"species.aasimar.celestial-revelation.expires": 10,
			},
		},
		target: new BaseMonster("Finite", 30, 4),
		targetInput: { hitPointMode: "finite" },
		additionalTargets: [
			{ id: "secondary", definition: new BaseMonster("Secondary", 12, 1000), hitPointMode: "inexhaustible" },
		],
		strategy: { orderTriggers: (_s, ids) => [...ids].reverse() },
	});
	f.engine.beginTurn("hero");
	const action = f.engine.beginAttackAction("hero");
	const attack = f.engine.attackInAction(action, { targetId: "target", weaponInstanceId: "weapon", mode: "melee" });
	assert.equal(attack.hit.isHit, false);
	assert.equal(attack.damage?.appliedDamage, 3);
	assert.equal(attack.additionalDamage?.[0]?.appliedDamage, 3);
	assert.equal(attack.attackDamageReducedToZero, true);
	assert.equal(attack.triggeredAttacks[0]?.attackOrigin, "hew");
	assert.equal(attack.triggeredAttacks[0]?.damage?.appliedDamage, 12);
	assert.equal(f.roller.remaining, 0);
});

test("elapsed ten-minute gap ends Revelation and Large Form without restoring either resource", () => {
	for (const species of [{ id: "aasimar" }, { id: "goliath", ancestry: "hill" }] as const) {
		const f = fixture(species, []);
		const resource = species.id === "aasimar" ? "species.aasimar.celestial-revelation" : "species.goliath.large-form";
		f.engine.beginTurn("hero");
		f.engine.resolveFeatureActions("hero", "before-attack");
		f.engine.endTurn();
		f.engine.advanceElapsedTime(0);
		assert.equal(f.encounter.state("hero").classState[`${resource}.active`], true);
		f.engine.advanceElapsedTime(10);
		assert.equal(f.encounter.state("hero").classState[`${resource}.active`], false);
		assert.equal(f.encounter.resourceRemaining("hero", resource), 0);
		assert.equal(f.encounter.snapshot("hero").size, "medium");
		assert.equal(f.encounter.state("hero").speedBonus, undefined);
	}
});

test("Inner Radiance skips a dead finite target on later turns while preserving same-attack overkill", () => {
	const f = fixture({ id: "aasimar" }, [12, 4], {
		target: new BaseMonster("Finite", 12, 1),
		targetInput: { hitPointMode: "finite" },
	});
	for (let turn = 1; turn <= 3; turn++) {
		f.engine.beginTurn("hero");
		if (turn === 1) {
			f.engine.resolveFeatureActions("hero", "before-attack");
			f.engine.resolveAttackAction("hero", "target");
		}
		f.engine.endTurn();
	}
	assert.equal(f.engine.damageEvents.filter((event) => event.targetId === "target").length, 2);
	assert.equal(
		f.engine.damageEvents
			.filter((event) => event.targetId === "target")
			.reduce((n, event) => n + event.result.appliedDamage, 0),
		10,
	);
	assert.equal(
		f.engine.damageEvents.filter((event) => event.source.includes("inner-radiance") && event.targetId === "hero")
			.length,
		3,
	);
});
