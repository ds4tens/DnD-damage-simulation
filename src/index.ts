import BaseCharacter from "./character/BaseCharacter.ts";
import BaseClass from "./classes/BaseClass.ts";
import { CombatEngine } from "./combat/AttackResolver.ts";
import { EncounterState } from "./combat/EncounterState.ts";
import { SeededDiceRoller } from "./dice/RandomSource.ts";
import { Glaive } from "./Items/Weapon/WeaponList.ts";
import BaseMonster from "./monster/BaseMonster.ts";

// Foundation demonstration; P5 adds the completed feat scenario.
const character = new BaseCharacter(6, new BaseClass([Glaive]), Glaive, "strength", {
	strength: 16,
	dexterity: 10,
	constitution: 10,
	intelligence: 10,
	wisdom: 10,
	charisma: 10,
});
const encounter = new EncounterState([
	{ id: "hero", definition: character },
	{ id: "target", definition: new BaseMonster("Training Ogre", 12, 50) },
]);
const engine = new CombatEngine(encounter, { roller: new SeededDiceRoller(2024) });
encounter.beginTurn("hero");
console.log(JSON.stringify(engine.resolveAttackAction("hero", "target", { distance: 5 }), null, 2));
encounter.endTurn();
