import { buildCharacter } from "../character/CharacterBuilder.ts";
import BaseClass from "../classes/BaseClass.ts";
import { CombatEngine } from "../combat/AttackResolver.ts";
import type { CombatEngineOptions } from "../combat/CombatTypes.ts";
import type { DamageComponent } from "../combat/DamageTypes.ts";
import { EncounterState } from "../combat/EncounterState.ts";
import Dice from "../dice/dice.ts";
import { FixedDiceRoller, type FixedRoll } from "../dice/RandomSource.ts";
import { EFeatName } from "../feats/Feats.ts";
import Weapon from "../Items/Weapon.ts";
import BaseMonster from "../monster/BaseMonster.ts";

/** Synthetic damage fixture, not a claim that this weapon exists in PHB. */
export function createFiveFeatScenario(
	options: {
		rolls?: readonly FixedRoll[];
		strategy?: CombatEngineOptions["strategy"];
		hooks?: CombatEngineOptions["hooks"];
	} = {},
) {
	const weapon = new Weapon(
		"Synthetic Heavy Slashing 2d6",
		"Integration fixture",
		"martial",
		"common",
		0,
		0,
		"medium",
		[new Dice(6), new Dice(6)],
		"slashing",
		undefined,
		{ category: "melee", properties: ["heavy", "two-handed"] },
	);
	const baseStats = { strength: 13, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
	const character = buildCharacter({
		level: 6,
		characterClass: new BaseClass([weapon]),
		weapon,
		weaponPrimaryStat: "strength",
		stats: baseStats,
		feats: [
			{ name: EFeatName.ABILITY_SCORE_IMPROVEMENT, abilityScoreImprovement: [{ abilityScore: "strength", amount: 2 }] },
			{ name: EFeatName.SAVAGE_ATTACKER },
			{ name: EFeatName.PIERCER, abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
			{ name: EFeatName.SLASHER, abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
			{ name: EFeatName.GREAT_WEAPON_MASTER, abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
		],
	});
	const encounter = new EncounterState([
		{ id: "hero", definition: character },
		{ id: "first", definition: new BaseMonster("First target", 12, 30) },
		{ id: "second", definition: new BaseMonster("Second target", 12, 25) },
	]);
	const roller = new FixedDiceRoller(
		options.rolls ?? [
			{ sides: 20, value: 20 },
			...[1, 1, 1, 1, 2, 3, 4, 5].map((value) => ({ sides: 6, value })),
			...[1, 8, 2, 7].map((value) => ({ sides: 8, value })),
			{ sides: 20, value: 10 },
			...[1, 2].map((value) => ({ sides: 6, value })),
			{ sides: 8, value: 4 },
		],
	);
	const engine = new CombatEngine(encounter, {
		roller,
		...(options.strategy ? { strategy: options.strategy } : {}),
		...(options.hooks ? { hooks: options.hooks } : {}),
	});
	const components: DamageComponent[] = [
		{
			id: "synthetic.weapon",
			source: `weapon.${weapon.name}`,
			origin: "weapon",
			damageType: "slashing",
			dice: [6, 6],
			flatBonus: character.getDamageBonus(),
			doublesOnCrit: true,
		},
		{
			id: "synthetic.piercing",
			source: "scenario.piercing",
			origin: "other",
			damageType: "piercing",
			dice: [8],
			flatBonus: 0,
			doublesOnCrit: true,
		},
	];
	engine.beginTurn("hero");
	const run = () =>
		engine.resolveSingleAttack({
			actorId: "hero",
			targetId: "first",
			actionSource: "attack-action",
			mode: "melee",
			weapon,
			profile: { attackBonus: character.getAttackBonus(), damage: components },
		});
	return { character, baseStats, weapon, encounter, roller, engine, run };
}
