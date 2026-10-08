import assert from "node:assert/strict";
import test from "node:test";
import { assessBenefitSupport, type BenefitMetadata, summarizeBenefitSupport } from "./FeatureSupport.ts";

test("unsupported applicable weapon benefits block comparison without an explicit request", () => {
	const benefits: BenefitMetadata[] = [
		{ id: "example.asi", status: "supported", domain: "supported" },
		{ id: "example.extra-damage", status: "unsupported", domain: "offense" },
	];
	assert.equal(summarizeBenefitSupport(benefits).supportedBenefits.length, 1);
	assert.throws(() => assessBenefitSupport(benefits), /applicable weapon/);
});
test("vision support gating is per-benefit and depends on the actual scenario", () => {
	const darkvision: BenefitMetadata = { id: "dwarf.darkvision", status: "unsupported", domain: "vision" };
	assert.doesNotThrow(() =>
		assessBenefitSupport([darkvision], { lighting: "bright", targetConditions: ["invisible"] }),
	);
	assert.throws(() => assessBenefitSupport([darkvision], { lighting: "darkness" }), /lighting/);
	const sight: BenefitMetadata = { id: "boon-of-truesight.truesight", status: "unsupported", domain: "vision" };
	assert.doesNotThrow(() => assessBenefitSupport([sight], { lighting: "bright" }));
	assert.throws(
		() => assessBenefitSupport([sight], { lighting: "bright", targetConditions: ["invisible"] }),
		/Invisible/,
	);
	assert.throws(
		() =>
			assessBenefitSupport([{ id: "dragonborn.breath-weapon", status: "unsupported", domain: "nonweapon" }], {
				requestedBenefits: ["dragonborn.breath-weapon"],
			}),
		/requested/,
	);
});
