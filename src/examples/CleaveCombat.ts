import BaseCharacter, { defaultStatBlock } from "../character/BaseCharacter.ts";
import Barbarian from "../classes/barbarian/Barbarian.ts";
import type { CombatEngineOptions } from "../combat/CombatTypes.ts";
import { CombatEngine } from "../combat/engine/AttackResolver.ts";
import { EncounterState } from "../combat/state/EncounterState.ts";
import { FixedDiceRoller, type FixedRoll } from "../dice/RandomSource.ts";
import { Greataxe } from "../items/weapons/WeaponList.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { createProbabilisticCleaveProvider, seededCleaveRandom } from "../simulation/scenario/Cleave.ts";

/** An executable external scenario with two real, independently mutable targets.
 * Fixed assumed distances replace a map; Bernoulli availability never scales damage.
 * The partial Barbarian definition is explicitly retained, no class resources added.
 */
export function createCleaveCombatScenario(
	options: {
		probability?: number;
		environmentSeed?: number;
		environmentRandom?: () => number;
		combatRolls?: readonly FixedRoll[];
		primaryHp?: number;
		secondaryHp?: number;
		strategy?: CombatEngineOptions["strategy"];
	} = {},
) {
	if (options.environmentSeed !== undefined && options.environmentRandom !== undefined)
		throw new Error("Choose an environment seed or injected random source, not both");
	const environmentSeed = options.environmentRandom === undefined ? (options.environmentSeed ?? 1) : undefined;
	const probability = options.probability ?? 1;
	const opportunities = createProbabilisticCleaveProvider({
		probability,
		candidate: { targetId: "secondary", distanceToActor: 5, distanceToPrimary: 5 },
		random: options.environmentRandom ?? seededCleaveRandom(environmentSeed ?? 1),
	});
	const actor = new BaseCharacter(
		1,
		new Barbarian([Greataxe]),
		Greataxe,
		"strength",
		{
			...defaultStatBlock,
			strength: 16,
		},
		16,
		30,
	);
	const encounter = new EncounterState([
		{ id: "hero", definition: actor, masteredWeaponNames: ["Greataxe"] },
		{ id: "primary", definition: new BaseMonster("Primary target", 12, options.primaryHp ?? 30) },
		{ id: "secondary", definition: new BaseMonster("Secondary target", 12, options.secondaryHp ?? 25) },
	]);
	const roller = new FixedDiceRoller(options.combatRolls ?? [10, 5, 10, 4]);
	const engine = new CombatEngine(encounter, {
		roller,
		cleaveCandidates: opportunities.candidates,
		distanceFor: () => 5,
		...(options.strategy === undefined ? {} : { strategy: options.strategy }),
	});
	engine.beginTurn("hero");
	return {
		encounter,
		engine,
		roller,
		opportunities,
		assumptions: Object.freeze({
			probability,
			environmentSeed,
			geometry: "Two concrete targets at assumed 5-foot distances",
			supply: "Unlimited ammunition and thrown stock",
		}),
		run: () => engine.resolveAttackAction("hero", "primary"),
	};
}
