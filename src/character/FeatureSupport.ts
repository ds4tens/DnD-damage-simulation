export type BenefitDomain =
	| "supported"
	| "offense"
	| "nonweapon"
	| "cover"
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
	readonly interpretations: readonly {
		readonly id: string;
		readonly policy: string;
		readonly sources: readonly string[];
	}[];
};
export type DprSupportContext = {
	/** Every expressly requested unsupported benefit is rejected before trials. */
	requestedBenefits?: readonly string[];
	lighting?: "bright" | "dim" | "darkness";
	/** Incoming target conditions can make sight benefits useful in bright light. */
	targetConditions?: readonly string[];
};
export function assessBenefitSupport(
	benefits: readonly BenefitMetadata[],
	context: DprSupportContext = {},
): BuildSupportReport {
	const blockers = benefits.filter((benefit) => benefit.status === "unsupported" && benefit.domain === "offense");
	if (blockers.length > 0)
		throw new Error(
			`Unsupported applicable weapon/Unarmed benefit: ${blockers.map((benefit) => benefit.id).join(", ")}`,
		);
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
	if (
		context.targetConditions?.includes("invisible") &&
		benefits.some(
			(benefit) =>
				benefit.status === "unsupported" && (benefit.id.endsWith(".blindsight") || benefit.id.endsWith(".truesight")),
		)
	)
		throw new Error("Unsupported impactful sight benefit against an Invisible target");
	return summarizeBenefitSupport(benefits);
}
/** Legality is independent of runtime support; comparison performs the gate. */
export function summarizeBenefitSupport(benefits: readonly BenefitMetadata[]): BuildSupportReport {
	return Object.freeze({
		supportedBenefits: Object.freeze(
			benefits.filter((benefit) => benefit.status === "supported").map((benefit) => benefit.id),
		),
		limitations: Object.freeze(benefits.filter((benefit) => benefit.status === "unsupported")),
		interpretations: Object.freeze(
			benefits.some((benefit) => ["goliath.giant-ancestry.fire", "goliath.giant-ancestry.frost"].includes(benefit.id))
				? [
						Object.freeze({
							id: "goliath-rider-as-attack-damage-v1",
							policy:
								"Fire/Frost require positive primary attack damage; their additional dice count as attack dice for criticals and the current Piercer reroll window. Savage Attacker changes weapon dice only. No explicit official rider clarification was found.",
							sources: Object.freeze([
								"https://www.dndbeyond.com/sources/dnd/br-2024/character-origins#Goliath",
								"https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game#CriticalHits",
							]),
						}),
					]
				: [],
		),
	});
}
