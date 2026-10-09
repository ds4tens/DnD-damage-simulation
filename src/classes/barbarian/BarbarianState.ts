import type { CombatantState } from "../../combat/state/EncounterState.ts";

export type BarbarianCombatState = {
	rage?: { expiresOwnTurn: number; maximumOwnTurn: number; persistent: boolean };
	recklessExpiresOwnTurn?: number;
	wildHeartPower?: "falcon" | "lion" | "ram";
};

export function endRage(state: CombatantState): void {
	state.classState.raging = false;
	if (state.barbarian) {
		delete state.barbarian.rage;
		delete state.barbarian.wildHeartPower;
	}
}

export function extendRage(state: CombatantState): void {
	if (state.classState.raging !== true || !state.barbarian?.rage || state.barbarian.rage.persistent) return;
	state.barbarian.rage.expiresOwnTurn = Math.min(state.ownTurnCount + 1, state.barbarian.rage.maximumOwnTurn);
}

export function isReckless(state: CombatantState): boolean {
	return (state.barbarian?.recklessExpiresOwnTurn ?? 0) > state.ownTurnCount;
}
