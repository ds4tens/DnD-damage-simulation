import type { AttackResult } from "../combat/CombatTypes.ts";
import type { DamageResult } from "../combat/DamageTypes.ts";

export type AttackMetrics = {
	appliedDamage: number;
	hitPointsLost: number;
	temporaryHitPointsLost: number;
	overkill: number;
	limitations: string[];
};

/** Each physical attack counts once even if its result is exposed both as child and root. */
export function collectAttackMetrics(roots: readonly AttackResult[], seen = new Set<string>()): AttackMetrics {
	const metrics: AttackMetrics = {
		appliedDamage: 0,
		hitPointsLost: 0,
		temporaryHitPointsLost: 0,
		overkill: 0,
		limitations: [],
	};
	const limitations = new Set<string>();
	const visit = (attack: AttackResult): void => {
		if (seen.has(attack.attackId)) return;
		seen.add(attack.attackId);
		for (const limitation of attack.limitations) limitations.add(limitation);
		if (attack.damage) {
			metrics.appliedDamage += attack.damage.appliedDamage;
			metrics.hitPointsLost += attack.damage.hp.hpLost;
			metrics.temporaryHitPointsLost += attack.damage.hp.temporaryHpLost;
			metrics.overkill += attack.damage.hp.overflow;
		}
		for (const child of attack.triggeredAttacks) visit(child);
	};
	for (const root of roots) visit(root);
	metrics.limitations = [...limitations].sort();
	return metrics;
}

/** The engine ledger also contains separate feature and end-turn damage. */
export function collectDamageMetrics(
	events: readonly { actorId: string; result: DamageResult }[],
	actorId: string,
): Omit<AttackMetrics, "limitations"> {
	const metrics = { appliedDamage: 0, hitPointsLost: 0, temporaryHitPointsLost: 0, overkill: 0 };
	for (const event of events) {
		if (event.actorId !== actorId) continue;
		metrics.appliedDamage += event.result.appliedDamage;
		metrics.hitPointsLost += event.result.hp.hpLost;
		metrics.temporaryHitPointsLost += event.result.hp.temporaryHpLost;
		metrics.overkill += event.result.hp.overflow;
	}
	return metrics;
}
