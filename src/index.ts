import { writeFileSync } from "node:fs";
import BaseCharacter from "./character/BaseCharacter.ts";
import { buildCharacter } from "./character/CharacterBuilder.ts";
import Barbarian from "./classes/Barbarian.ts";
import Berserker from "./classes/BarbarianSubclasses/Berserker.ts";
import WildHeart from "./classes/BarbarianSubclasses/WildHeart.ts";
import WorldTree from "./classes/BarbarianSubclasses/WorldTree.ts";
import Zealot from "./classes/BarbarianSubclasses/Zealot.ts";
import type BaseClass from "./classes/BaseClass.ts";
import { resolveAttackTurn } from "./combat/AttackResolver.ts";
import { EFeatName } from "./feats/Feats.ts";
import * as WeaponList from "./Items/Weapon/WeaponList.ts";
import type Weapon from "./Items/Weapon.ts";
import BaseMonster from "./monster/BaseMonster.ts";

type TBarbarianConstructor = new (weaponProficiencies: Weapon[]) => Barbarian;
type TSimulationResult = Record<string, { level: number; averageDamage: number }[]>;

// const SIMULATION_COUNT = 1000;
// const LEVELS = Array.from({ length: 20 }, (_, index) => index + 1);

// const subclassEntries: { name: string; ClassConstructor: TBarbarianConstructor }[] = [
// 	{ name: "Barbarian", ClassConstructor: Barbarian },
// 	{ name: "Berserker", ClassConstructor: Berserker },
// 	{ name: "WildHeart", ClassConstructor: WildHeart },
// 	{ name: "WorldTree", ClassConstructor: WorldTree },
// 	{ name: "Zealot", ClassConstructor: Zealot },
// ];

// const weaponEntries = Object.values(WeaponList).map((weapon) => ({ name: weapon.name, weapon }));

// const simulationWeaponProficiencies = weaponEntries.map((entry) => entry.weapon);

function createAttacker(level: number, characterClass: BaseClass, weapon: Weapon): BaseCharacter {
	return new BaseCharacter(level, characterClass, weapon, "strength", {
		strength: 18,
		dexterity: 10,
		constitution: 10,
		intelligence: 10,
		wisdom: 10,
		charisma: 10,
	});
}

// function simulateAverageDamage(level: number, ClassConstructor: TBarbarianConstructor, weapon: Weapon): number {
// 	let totalDamage = 0;

// 	for (let simulationIndex = 0; simulationIndex < SIMULATION_COUNT; simulationIndex++) {
// 		const barbarianClass = new ClassConstructor(simulationWeaponProficiencies);
// 		barbarianClass.startRage();

// 		const attacker = createAttacker(level, barbarianClass, weapon);
// 		const target = new BaseMonster("Training Ogre", 16, 50);

// 		totalDamage += resolveAttackTurn(attacker, target, 5).totalDamage;
// 	}

// 	return Number((totalDamage / SIMULATION_COUNT).toFixed(2));
// }

// const results: TSimulationResult = {};

// for (const subclassEntry of subclassEntries) {
// 	for (const weaponEntry of weaponEntries) {
// 		const resultKey = `${subclassEntry.name} + ${weaponEntry.name}`;
// 		results[resultKey] = LEVELS.map((level) => ({
// 			level,
// 			averageDamage: simulateAverageDamage(level, subclassEntry.ClassConstructor, weaponEntry.weapon),
// 		}));
// 	}
// }

// writeFileSync("damageOverall.json", `${JSON.stringify(results, null, 2)}\n`);

// console.log(`Saved ${Object.keys(results).length} simulation series to damageOverall.json`);

const testBarb = new Barbarian([WeaponList.Glaive]);
testBarb.startRage();
const testAttacker1 = buildCharacter({
	level: 6,
	characterClass: testBarb,
	weapon: WeaponList.Glaive,
	weaponPrimaryStat: "strength",
	stats: { strength: 16, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
	feats: [],
});

const testAttacker2 = buildCharacter({
	level: 6,
	characterClass: testBarb,
	weapon: WeaponList.Glaive,
	weaponPrimaryStat: "strength",
	stats: { strength: 16, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
	feats: [
		{
			name: EFeatName.ABLITY_SCORE_IMPROVEMENT,
			type: "general",
			abilityScoreImprovement: [{ abilityScore: "strength", amount: 2 }],
		},
	],
});
const testTarget1 = new BaseMonster("Training Ogre", 12, 50);
const testTarget2 = new BaseMonster("Training Ogre", 12, 50);

const battleLog1 = [];
const battleLog2 = [];

let totalDamage1 = 0;
let totalDamage2 = 0;

for (let i = 0; i < 1000; i++) {
	battleLog1.push(resolveAttackTurn(testAttacker1, testTarget1, 5));
	battleLog2.push(resolveAttackTurn(testAttacker2, testTarget2, 5));
	totalDamage1 += battleLog1[i]!.totalDamage;
	totalDamage2 += battleLog2[i]!.totalDamage;
}

writeFileSync("battleLog1.json", `${JSON.stringify(battleLog1, null, 2)}\n`);
writeFileSync("battleLog2.json", `${JSON.stringify(battleLog2, null, 2)}\n`);

console.log(`Total damage 1: ${totalDamage1 / 1000}`);
console.log(`Total damage 2: ${totalDamage2 / 1000}`);
