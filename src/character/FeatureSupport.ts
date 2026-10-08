export type BenefitDomain =
	| "supported"
	| "movement"
	| "spells"
	| "defense"
	| "allies"
	| "enemy-actions"
	| "vision"
	| "utility";
export type BenefitMetadata = {
	readonly id: string;
	readonly status: "supported" | "unsupported";
	readonly domain: BenefitDomain;
};
export type BuildSupportReport = {
	readonly supportedBenefits: readonly string[];
	readonly limitations: readonly BenefitMetadata[];
};
export type DprSupportContext = {
	/** Every expressly requested unsupported benefit is rejected before trials. */
	requestedBenefits?: readonly string[];
	lighting?: "bright" | "dim" | "darkness";
};
export function assessBenefitSupport(
	benefits: readonly BenefitMetadata[],
	context: DprSupportContext = {},
): BuildSupportReport {
	const known = new Set(benefits.map((benefit) => benefit.id));
	for (const id of context.requestedBenefits ?? []) {
		if (!known.has(id)) throw new Error(`Unknown requested benefit: ${id}`);
		if (benefits.some((benefit) => benefit.id === id && benefit.status === "unsupported"))
			throw new Error(`Unsupported requested benefit: ${id}`);
	}
	if (
		context.lighting !== undefined &&
		context.lighting !== "bright" &&
		benefits.some((benefit) => benefit.domain === "vision" && benefit.status === "unsupported")
	)
		throw new Error("Unsupported impactful vision benefit in this lighting scenario");
	return Object.freeze({
		supportedBenefits: Object.freeze(
			benefits.filter((benefit) => benefit.status === "supported").map((benefit) => benefit.id),
		),
		limitations: Object.freeze(benefits.filter((benefit) => benefit.status === "unsupported")),
	});
}
