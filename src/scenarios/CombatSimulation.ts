import BaseCharacter, { defaultStatBlock } from "../character/BaseCharacter.ts";
import BaseClass from "../classes/BaseClass.ts";
import { CombatEngine } from "../combat/AttackResolver.ts";
import type { AttackActionResult, AttackResult, TargetSnapshot } from "../combat/CombatTypes.ts";
import { EncounterState } from "../combat/EncounterState.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import { Greataxe } from "../Items/Weapon/WeaponList.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { createProbabilisticCleaveProvider, seededCleaveRandom } from "./Cleave.ts";

/** Synthetic mastery entitlement isolates the engine from partial class features. */
class DemonstrationClass extends BaseClass {
	override getWeaponMasteryCount(): number {
		return 1;
	}
	override canUseWeaponMastery(): boolean {
		return true;
	}
}
export type DemonstrationRound = {
	roundNumber: number;
	attackAction: AttackActionResult;
	returnAttack: AttackResult;
	targets: readonly TargetSnapshot[];
};
/** A reproducible scenario, with geometry and environment RNG outside combat rules. */
export function runCombatSimulationDemo() {
	const actor = new BaseCharacter(
		1,
		new DemonstrationClass([Greataxe]),
		Greataxe,
		"strength",
		{ ...defaultStatBlock, strength: 16 },
		16,
		30,
		[],
		{ defenses: { resistances: ["fire"] } },
	);
	const encounter = new EncounterState([
		{ id: "hero", definition: actor, initialTemporaryHp: 4, masteredWeaponIds: ["greataxe"] },
		{ id: "first", definition: new BaseMonster("First", 10, 30) },
		{ id: "second", definition: new BaseMonster("Second", 10, 25) },
	]);
	const roller = new FixedDiceRoller([10, 5, 10, 4, 10, 10, 6, 10, 2, 10]);
	const cleave = createProbabilisticCleaveProvider({
		probability: 1,
		candidate: { targetId: "second", distanceToActor: 5, distanceToPrimary: 5 },
		random: seededCleaveRandom(2024),
	});
	const engine = new CombatEngine(encounter, { roller, distanceFor: () => 5, cleaveCandidates: cleave.candidates });
	const scheduler = engine.createScheduler({ order: ["hero", "first", "second"] });
	const rounds: DemonstrationRound[] = [];
	for (let roundNumber = 1; roundNumber <= 2; roundNumber++) {
		scheduler.beginNextTurn();
		const attackAction = engine.resolveAttackAction("hero", "first");
		scheduler.endTurn();
		scheduler.beginNextTurn();
		const returnAttack = engine.resolveSingleAttack({
			actorId: "first",
			targetId: "hero",
			actionSource: "attack-action",
			mode: "melee",
			profile: {
				attackBonus: 10,
				damage: [
					{
						id: "fire",
						source: "scenario.fixed-fire",
						origin: "other",
						damageType: "fire",
						dice: [],
						flatBonus: 6,
						doublesOnCrit: false,
					},
				],
			},
		});
		scheduler.endTurn();
		scheduler.beginNextTurn();
		scheduler.endTurn();
		rounds.push({
			roundNumber,
			attackAction,
			returnAttack,
			targets: encounter.ids.map((id) => encounter.snapshot(id)),
		});
	}
	return {
		ruleset: "D&D 2024 base",
		scenario: "Two rounds: Greataxe/Cleave, fire resistance and temporary HP",
		rounds,
		cleaveDecisions: cleave.decisions,
		remainingFixedRolls: roller.remaining,
	};
}
