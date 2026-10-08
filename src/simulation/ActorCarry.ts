import { combatantInputForBuild, type LegalCharacterBuild } from "../character/CharacterBuild.ts";
import type { CombatEngine } from "../combat/AttackResolver.ts";
import type { CombatantInput } from "../combat/CombatTypes.ts";
import { dprActorId } from "./Scenario.ts";

/** Transfer completed encounter state after the elapsed gap/rest, retaining the validated definition. */
export function carryActorToNextEpisode(build: LegalCharacterBuild, engine: CombatEngine): CombatantInput {
	const persistent = engine.exportPersistentState(dprActorId);
	const nextBase = combatantInputForBuild(build, dprActorId);
	const state = engine.encounter.state(dprActorId);
	// Grappled creatures belong to the completed encounter, not to physical inventory.
	const persistentHand = (value: string | null): string | null => (value?.startsWith("$grapple:") ? null : value);
	return {
		...nextBase,
		initialResources: persistent.resources,
		initialHitPoints: state.hitPoints,
		initialTemporaryHp: state.temporaryHp,
		initialClassState: { ...nextBase.initialClassState, ...persistent.classState },
		initialSpentWeaponInstanceIds: persistent.spentWeaponInstanceIds,
		weapons: engine.encounter.weapons(dprActorId),
		initialHands: { left: persistentHand(state.hands.left), right: persistentHand(state.hands.right) },
	};
}
