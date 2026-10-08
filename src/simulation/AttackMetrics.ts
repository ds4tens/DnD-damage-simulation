import type { DamageResult } from "../combat/DamageTypes.ts";

export type DamageMetrics = {
	appliedDamage: number;
	hitPointsLost: number;
	temporaryHitPointsLost: number;
	overkill: number;
};

/** The ledger also contains separate feature/end-turn damage, including possible self damage. */
export function collectDamageMetrics(
	events: readonly { actorId: string; targetId: string; result: DamageResult }[],
	actorId: string,
	targetIds: ReadonlySet<string>,
): DamageMetrics {
	const metrics = { appliedDamage: 0, hitPointsLost: 0, temporaryHitPointsLost: 0, overkill: 0 };
	for (const event of events) {
		if (event.actorId !== actorId || !targetIds.has(event.targetId)) continue;
		metrics.appliedDamage += event.result.appliedDamage;
		metrics.hitPointsLost += event.result.hp.hpLost;
		metrics.temporaryHitPointsLost += event.result.hp.temporaryHpLost;
		metrics.overkill += event.result.hp.overflow;
	}
	return metrics;
}
