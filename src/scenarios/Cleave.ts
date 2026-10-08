import { SeededDiceRoller } from "../dice/RandomSource.ts";

export type CleaveScenarioCandidate = {
	targetId: string;
	distanceToActor: number;
	distanceToPrimary: number;
};
export type CleaveOpportunityDecision = {
	actorId: string;
	turnId: number;
	probability: number;
	sample: number | null;
	available: boolean;
};

/** This is an independent environment stream, never the engine's combat roller. */
export function seededCleaveRandom(seed: number): () => number {
	const environment = new SeededDiceRoller(seed);
	return () => (environment.roll(0x100000000) - 1) / 0x100000000;
}

/** External scenario approximation of adjacency, not a Weapon Mastery rule.
 * A fresh provider belongs to each independent encounter. The engine calls it only
 * after an eligible Cleave hit, and still checks the real target's HP and geometry.
 * No hit/damage roll or synthetic target is produced here.
 */
export function createProbabilisticCleaveProvider(options: {
	probability: number;
	candidate: Readonly<CleaveScenarioCandidate>;
	random: () => number;
}) {
	if (!Number.isFinite(options.probability) || options.probability < 0 || options.probability > 1)
		throw new Error("Cleave probability must be in [0, 1]");
	if (!options.candidate.targetId) throw new Error("Cleave requires a concrete target ID");
	for (const distance of [options.candidate.distanceToActor, options.candidate.distanceToPrimary])
		if (!Number.isFinite(distance) || distance < 0) throw new Error("Invalid Cleave scenario distance");
	const probability = options.probability;
	const random = options.random;
	const candidate = Object.freeze({ ...options.candidate });
	const cached = new Map<string, Map<number, CleaveOpportunityDecision>>();
	const log: CleaveOpportunityDecision[] = [];
	const candidates = (actorId: string, primaryTargetId: string, turnId: number): readonly CleaveScenarioCandidate[] => {
		if (!actorId || !primaryTargetId || !Number.isSafeInteger(turnId) || turnId < 1)
			throw new Error("Invalid Cleave opportunity identity");
		const actorCache = cached.get(actorId) ?? new Map<number, CleaveOpportunityDecision>();
		let decision = actorCache.get(turnId);
		if (!decision) {
			const sample = probability === 0 || probability === 1 ? null : random();
			if (sample !== null && (!Number.isFinite(sample) || sample < 0 || sample >= 1))
				throw new Error("Environment random source must return a value in [0, 1)");
			decision = Object.freeze({
				actorId,
				turnId,
				probability,
				sample,
				available: probability === 1 || (sample !== null && sample < probability),
			});
			actorCache.set(turnId, decision);
			cached.set(actorId, actorCache);
			log.push(decision);
		}
		return decision.available && candidate.targetId !== primaryTargetId && candidate.targetId !== actorId
			? Object.freeze([candidate])
			: Object.freeze([]);
	};
	return Object.freeze({
		candidates,
		get decisions(): readonly CleaveOpportunityDecision[] {
			return Object.freeze(log.map((entry) => Object.freeze({ ...entry })));
		},
	});
}
