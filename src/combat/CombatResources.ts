import type { EncounterState } from "./EncounterState.ts";

export type RecoveryEvent = "short-rest" | "long-rest";
export type ResourceDefinition = {
	id: string;
	maxUses: number;
	shortRest: "none" | "one" | "all";
	longRest: "none" | "all";
	/** Defaults to maxUses; e.g. Heroic Inspiration starts empty. */
	initialUses?: number;
};
export type ResourcePool = { definition: Readonly<ResourceDefinition>; remaining: number };
export type PersistentResourceSnapshot = Readonly<Record<string, number>>;
export type ResourceChange = { resourceId: string; previous: number; current: number };
export type PersistentCombatantState = {
	resources: PersistentResourceSnapshot;
	/** Only explicit persistent feature flags; never active Rage or turn effects. */
	classState: Readonly<Record<string, number | boolean | string>>;
	spentWeaponInstanceIds: readonly string[];
};

export function validateResourceDefinition(definition: ResourceDefinition): void {
	if (
		!definition.id ||
		!Number.isSafeInteger(definition.maxUses) ||
		definition.maxUses < 0 ||
		!["none", "one", "all"].includes(definition.shortRest) ||
		!["none", "all"].includes(definition.longRest) ||
		(definition.initialUses !== undefined &&
			(!Number.isSafeInteger(definition.initialUses) ||
				definition.initialUses < 0 ||
				definition.initialUses > definition.maxUses))
	)
		throw new Error("Invalid combat resource definition");
}

/** Resource recovery only: this does not model resting time, HP or Hit Dice. */
export function recoverResources(
	encounter: EncounterState,
	actorId: string,
	event: RecoveryEvent,
): readonly ResourceChange[] {
	if (event !== "short-rest" && event !== "long-rest") throw new Error("Invalid recovery event");
	const changes: ResourceChange[] = [];
	for (const [id, pool] of Object.entries(encounter.state(actorId).resources)) {
		const previous = pool.remaining;
		const recovery = event === "short-rest" ? pool.definition.shortRest : pool.definition.longRest;
		if (recovery === "all") pool.remaining = pool.definition.maxUses;
		else if (recovery === "one") pool.remaining = Math.min(pool.definition.maxUses, pool.remaining + 1);
		if (pool.remaining !== previous) changes.push({ resourceId: id, previous, current: pool.remaining });
	}
	return changes;
}
