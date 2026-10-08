export const seedDerivationVersion = "dpr-seeds-v1";
export const combatRngAlgorithm = "mulberry32-v1";

export type SeedIdentity = {
	rootSeed: number;
	rulesetId: string;
	codeVersion: string;
	buildId: string;
	strategyId: string;
	scenarioId: string;
	trialIndex: number;
};

export function validateUnsignedSeed(value: number): void {
	if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff)
		throw new Error("Root seed must be an unsigned 32-bit integer");
}

/** UTF-8 FNV-1a then an unsigned avalanche; JSON tuple encoding prevents delimiter collisions. */
export function deriveSeed(identity: SeedIdentity, stream: string): number {
	validateUnsignedSeed(identity.rootSeed);
	if (!Number.isSafeInteger(identity.trialIndex) || identity.trialIndex < 0)
		throw new Error("Trial index must be a nonnegative safe integer");
	const ids = [
		identity.rulesetId,
		identity.codeVersion,
		identity.buildId,
		identity.strategyId,
		identity.scenarioId,
		stream,
	];
	if (ids.some((id) => typeof id !== "string" || id.trim().length === 0)) throw new Error("Seed IDs must be nonempty");
	const text = JSON.stringify([seedDerivationVersion, identity.rootSeed, ...ids, identity.trialIndex]);
	let hash = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
	hash ^= hash >>> 16;
	hash = Math.imul(hash, 0x85ebca6b);
	hash ^= hash >>> 13;
	hash = Math.imul(hash, 0xc2b2ae35);
	return (hash ^ (hash >>> 16)) >>> 0;
}
