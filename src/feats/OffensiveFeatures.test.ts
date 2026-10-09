import assert from "node:assert/strict";
import test from "node:test";
import BaseCharacter, { defaultStatBlock } from "../character/BaseCharacter.ts";
import type { CharacterBuildData } from "../character/CombatantData.ts";
import BaseClass from "../classes/BaseClass.ts";
import { CombatEngine } from "../combat/AttackResolver.ts";
import type { CombatantInput, CombatHook } from "../combat/CombatTypes.ts";
import { EncounterState } from "../combat/EncounterState.ts";
import type { CombatStrategy } from "../combat/Strategy.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { Dagger, Mace, Quarterstaff } from "../Items/Weapon/WeaponList.ts";
import type Weapon from "../Items/Weapon.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import type { FeatName, FeatSelection } from "./FeatTypes.ts";

class TwoAttacks extends BaseClass {
	override getAttackCount() {
		return 2;
	}
}
const feat = (name: FeatName, ability: "strength" | "dexterity" = "strength"): FeatSelection => ({
	name,
	...(name === "tavern-brawler" ? {} : { abilityScoreImprovement: [{ abilityScore: ability, amount: 1 }] }),
});
function fixture(
	rolls: number[],
	feats: FeatSelection[],
	options: {
		weapon?: Weapon;
		shield?: boolean;
		buildData?: CharacterBuildData;
		strategy?: Partial<CombatStrategy>;
		heroInput?: Partial<CombatantInput>;
		targetInput?: Partial<CombatantInput>;
		target?: BaseMonster;
		additionalTargets?: CombatantInput[];
		hooks?: CombatHook[];
	} = {},
) {
	const weapon = options.weapon ?? Mace;
	const hero = new BaseCharacter(
		20,
		new TwoAttacks([Mace, Dagger, Quarterstaff]),
		weapon,
		"strength",
		{ ...defaultStatBlock, strength: 16, dexterity: 16 },
		16,
		100,
		feats,
		{
			shieldEquipped: options.shield ?? false,
			featValidationContext: { armorTraining: ["shield"] },
			...(options.buildData ? { buildData: options.buildData } : {}),
		},
	);
	const encounter = new EncounterState([
		{
			id: "hero",
			definition: hero,
			initialHands: { left: "weapon", right: options.shield ? "$shield" : null },
			weapons: [{ id: "weapon", weapon }],
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
		strategy: { useOptionalFeature: () => false, ...options.strategy },
		...(options.hooks ? { hooks: options.hooks } : {}),
	});
	return { encounter, engine, roller };
}

test("Tavern Brawler Unarmed critical rolls two d4, rerolls each1 once and leaves class components", () => {
	const f = fixture([20, 1, 1, 1, 4, 12, 3], [feat("tavern-brawler")]);
	f.engine.beginTurn("hero");
	const result = f.engine.resolveAttackAction("hero", "target", { unarmed: true });
	assert.equal(result.attacks[0]?.damage?.appliedDamage, 8);
	assert.deepEqual(
		result.attacks[0]?.damage?.components[0]?.dice.map((die) => die.value),
		[1, 4],
	);
	assert.equal(result.attacks[1]?.damage?.appliedDamage, 6);
	assert.equal(f.roller.remaining, 0);
});
test("Crusher critical grants Advantage on subsequent attacks and expires at source next turn", () => {
	const f = fixture([20, 2, 3, 2, 16, 4], [feat("crusher")]);
	f.engine.beginTurn("hero");
	const result = f.engine.resolveAttackAction("hero", "target");
	assert.deepEqual(result.attacks[1]?.hit.d20Rolls, [2, 16]);
	assert.equal(f.encounter.effectsOn("hero").length, 1);
	f.engine.endTurn();
	f.engine.beginTurn("target");
	f.engine.endTurn();
	f.engine.beginTurn("hero");
	assert.equal(f.encounter.effectsOn("hero").length, 0);
});
test("2024 Shield Bash has no Bonus Action cost and its failed save enables next melee attack", () => {
	const f = fixture([12, 4, 1, 2, 16, 4], [feat("shield-master")], { shield: true });
	f.engine.beginTurn("hero");
	const result = f.engine.resolveAttackAction("hero", "target");
	assert.equal(result.attacks[0]?.savingThrows?.[0]?.success, false);
	assert.deepEqual(result.attacks[1]?.hit.d20Rolls, [2, 16]);
	assert.equal(f.encounter.canUseBonusAction("hero"), true);
	assert.equal(result.attacks[1]?.savingThrows?.length ?? 0, 0);
});
test("Grappler Damage+Grapple reserves a free hand, applies owned Advantage and blocks oversized targets", () => {
	const f = fixture([12, 1, 2, 16], [feat("grappler")]);
	f.engine.beginTurn("hero");
	const result = f.engine.resolveAttackAction("hero", "target", { unarmed: true });
	assert.equal(result.attacks[0]?.savingThrows?.[0]?.ability, "strength");
	assert.equal(f.encounter.state("target").grappledBy, "hero");
	assert.equal(f.encounter.state("hero").hands.right, "$grapple:target");
	assert.deepEqual(result.attacks[1]?.hit.d20Rolls, [2, 16]);
	assert.equal(f.encounter.effectiveSpeed("target"), 0);
	const big = fixture([12, 12], [feat("grappler")], { targetInput: { size: "huge" } });
	big.engine.beginTurn("hero");
	big.engine.resolveAttackAction("hero", "target", { unarmed: true });
	assert.equal(big.encounter.state("target").grappledBy, undefined);
	assert.equal(big.encounter.state("hero").hands.right, null);
});
test("Poisoner consumes explicit dose, applies2d8 on failed save without critical doubling and ignores resistance", () => {
	const data: CharacterBuildData = {
		species: { id: "dwarf" },
		size: "medium",
		armorTraining: ["shield"],
		skills: [],
		expertise: [],
		tools: [],
		featMasteredWeaponIds: [],
		stock: { poisonDoses: 1 },
	};
	const target = new BaseMonster("Target", 12, 1000, 30, { defenses: { resistances: ["poison"] } });
	const f = fixture([20, 2, 3, 1, 5, 6, 12, 4], [feat("poisoner", "dexterity")], {
		buildData: data,
		target,
		strategy: {
			useOptionalFeature: () => true,
			chooseFeatureAction: (_s, c) => c.find((x) => x.id.startsWith("poisoner.apply."))?.id ?? null,
		},
	});
	f.engine.beginTurn("hero");
	f.engine.resolveFeatureActions("hero", "before-attack");
	const result = f.engine.resolveAttackAction("hero", "target");
	assert.equal(result.attacks[0]?.additionalDamage?.[0]?.appliedDamage, 11);
	assert.equal(result.attacks[0]?.additionalDamage?.[0]?.components[0]?.dice.length, 2);
	assert.equal(result.attacks[0]?.savingThrows?.[0]?.dc, 17);
	assert.equal(f.encounter.resourceRemaining("hero", "feat.poisoner.doses"), 0);
	assert.equal(result.attacks[1]?.additionalDamage?.length ?? 0, 0);
	f.engine.endTurn();
	f.engine.recoverResources("hero", "long-rest");
	assert.equal(f.encounter.resourceRemaining("hero", "feat.poisoner.doses"), 0);
});
test("Boon of Irresistible Offense adds the selected score once on natural20 and keeps immunity", () => {
	const resistant = new BaseMonster("Target", 12, 1000, 30, { defenses: { resistances: ["bludgeoning"] } });
	const f = fixture([20, 2, 3, 12, 4], [feat("boon-of-irresistible-offense")], { target: resistant });
	f.engine.beginTurn("hero");
	const result = f.engine.resolveAttackAction("hero", "target");
	assert.equal(result.attacks[0]?.damage?.appliedDamage, 25);
	assert.equal(result.attacks[1]?.damage?.appliedDamage, 7);
	const immune = fixture([20, 2, 3, 12, 4], [feat("boon-of-irresistible-offense")], {
		target: new BaseMonster("Immune", 12, 1000, 30, { defenses: { immunities: ["bludgeoning"] } }),
	});
	immune.engine.beginTurn("hero");
	assert.equal(immune.engine.resolveAttackAction("hero", "target").totalDamage, 0);
});

test("separate Poisoner save damage kill cannot grant Hew and elapsed time clears coating flags", () => {
	const data: CharacterBuildData = {
		species: { id: "dwarf" },
		size: "medium",
		armorTraining: [],
		skills: [],
		expertise: [],
		tools: [],
		featMasteredWeaponIds: [],
		stock: { poisonDoses: 1 },
	};
	const f = fixture([12, 4, 1, 4, 4], [feat("great-weapon-master"), feat("poisoner", "dexterity")], {
		buildData: data,
		heroInput: {
			initialResources: { "feat.poisoner.doses": 0 },
			initialClassState: { "poisoner.coating.weapon": 9, "poisoner.coating.weapon.ammunition": false },
		},
		target: new BaseMonster("Finite", 12, 8),
		targetInput: { hitPointMode: "finite" },
		additionalTargets: [
			{ id: "secondary", definition: new BaseMonster("Secondary", 12, 1000), hitPointMode: "inexhaustible" },
		],
	});
	f.engine.beginTurn("hero");
	const action = f.engine.beginAttackAction("hero");
	const attack = f.engine.attackInAction(action, { targetId: "target", weaponInstanceId: "weapon", mode: "melee" });
	assert.equal(attack.damage?.hp.reducedToZero, false);
	assert.equal(attack.additionalDamage?.[0]?.hp.reducedToZero, true);
	assert.equal(attack.attackDamageReducedToZero, false);
	assert.equal(attack.triggeredAttacks.length, 0);
	assert.equal(f.encounter.canUseBonusAction("hero"), true);
	assert.equal(f.roller.remaining, 0);
	f.engine.finishAttackAction(action);
	f.engine.endTurn();
	f.engine.advanceElapsedTime(10);
	assert.equal(
		Object.keys(f.encounter.state("hero").classState).some((key) => key.startsWith("poisoner.coating.")),
		false,
	);
	assert.equal(f.encounter.resourceRemaining("hero", "feat.poisoner.doses"), 0);
});

test("Poisoner coating is consumed after a primary kill without a corpse saving throw or damage", () => {
	const f = fixture([12, 4], [feat("poisoner", "dexterity")], {
		heroInput: { initialClassState: { "poisoner.coating.weapon": 9 } },
		target: new BaseMonster("Finite", 12, 1),
		targetInput: { hitPointMode: "finite" },
	});
	f.engine.beginTurn("hero");
	const attack = f.engine.resolveAttackAction("hero", "target").attacks[0];
	assert.equal(attack?.damage?.appliedDamage, 7);
	assert.equal(attack?.savingThrows, undefined);
	assert.equal(attack?.additionalDamage, undefined);
	assert.equal(f.encounter.state("hero").classState["poisoner.coating.weapon"], undefined);
	assert.equal(f.engine.damageEvents.length, 1);
	assert.equal(f.roller.remaining, 0);
});
