import type { DamageType } from "../combat/DamageTypes.ts";
import type { FeatName } from "../feats/FeatTypes.ts";
import { type BackgroundId, backgroundFacts } from "./BackgroundFacts.ts";
import type { TStatsType } from "./BaseCharacter.ts";
import type { BenefitMetadata } from "./FeatureSupport.ts";

export type { BackgroundId };
export const skillIds = [
	"acrobatics",
	"animal-handling",
	"arcana",
	"athletics",
	"deception",
	"history",
	"insight",
	"intimidation",
	"investigation",
	"medicine",
	"nature",
	"perception",
	"performance",
	"persuasion",
	"religion",
	"sleight-of-hand",
	"stealth",
	"survival",
] as const;
export const artisanToolIds = [
	"alchemist-s-supplies",
	"brewer-s-supplies",
	"calligrapher-s-supplies",
	"carpenter-s-tools",
	"cartographer-s-tools",
	"cobbler-s-tools",
	"cook-s-utensils",
	"glassblower-s-tools",
	"jeweler-s-tools",
	"leatherworker-s-tools",
	"mason-s-tools",
	"painter-s-supplies",
	"potter-s-tools",
	"smith-s-tools",
	"tinker-s-tools",
	"weaver-s-tools",
	"woodcarver-s-tools",
] as const;
export const musicalInstrumentIds = [
	"bagpipes",
	"drum",
	"dulcimer",
	"flute",
	"horn",
	"lute",
	"lyre",
	"pan-flute",
	"shawm",
	"viol",
] as const;
export const gamingSetIds = ["dice-set", "dragonchess-set", "playing-card-set", "three-dragon-ante-set"] as const;
export const toolIds = [
	...artisanToolIds,
	...musicalInstrumentIds,
	...gamingSetIds,
	"disguise-kit",
	"forgery-kit",
	"herbalism-kit",
	"navigator-s-tools",
	"poisoner-s-kit",
	"thieves-tools",
] as const;
export type SkillId = (typeof skillIds)[number];
export type SpeciesId =
	| "aasimar"
	| "dragonborn"
	| "dwarf"
	| "elf"
	| "gnome"
	| "goliath"
	| "halfling"
	| "human"
	| "orc"
	| "tiefling";
export type SpeciesSize = "small" | "medium";
export type MentalAbility = "intelligence" | "wisdom" | "charisma";
export type GiantAncestry = "cloud" | "fire" | "frost" | "hill" | "stone" | "storm";
export type DragonAncestry =
	| "black"
	| "blue"
	| "brass"
	| "bronze"
	| "copper"
	| "gold"
	| "green"
	| "red"
	| "silver"
	| "white";
export type SpeciesSelection =
	| { readonly id: "aasimar"; readonly size?: SpeciesSize }
	| { readonly id: "dragonborn"; readonly ancestry: DragonAncestry }
	| { readonly id: "dwarf" }
	| {
			readonly id: "elf";
			readonly lineage: "drow" | "high" | "wood";
			readonly spellcastingAbility: MentalAbility;
			readonly keenSenses: "insight" | "perception" | "survival";
			readonly highElfCantrip?: string;
	  }
	| { readonly id: "gnome"; readonly lineage: "forest" | "rock"; readonly spellcastingAbility: MentalAbility }
	| { readonly id: "goliath"; readonly ancestry: GiantAncestry }
	| { readonly id: "halfling" }
	| { readonly id: "human"; readonly size?: SpeciesSize; readonly skill: SkillId }
	| { readonly id: "orc" }
	| {
			readonly id: "tiefling";
			readonly size?: SpeciesSize;
			readonly legacy: "abyssal" | "chthonic" | "infernal";
			readonly spellcastingAbility: MentalAbility;
	  };
export type BackgroundMetadata = {
	readonly id: BackgroundId;
	readonly displayName: string;
	readonly abilityChoices: readonly TStatsType[];
	readonly feat: FeatName;
	readonly spellList?: "cleric" | "druid" | "wizard";
	readonly skills: readonly string[];
	readonly tool: string;
	readonly page: number;
	readonly equipmentGoldAlternative: 50;
};
export const backgroundMetadata: Readonly<Record<BackgroundId, BackgroundMetadata>> = Object.freeze(
	Object.fromEntries(
		backgroundFacts.map((f) => [
			f.id,
			Object.freeze({
				id: f.id,
				displayName: f.name,
				abilityChoices: Object.freeze([...f.abilityChoices]),
				feat: f.feat,
				...("spellList" in f ? { spellList: f.spellList } : {}),
				skills: Object.freeze([...f.skills]),
				tool: f.tool,
				page: f.page,
				equipmentGoldAlternative: 50,
			}),
		]),
	) as Record<BackgroundId, BackgroundMetadata>,
);
export const dragonDamageTypes: Readonly<Record<DragonAncestry, DamageType>> = Object.freeze({
	black: "acid",
	blue: "lightning",
	brass: "fire",
	bronze: "lightning",
	copper: "acid",
	gold: "fire",
	green: "poison",
	red: "fire",
	silver: "cold",
	white: "cold",
});
/** PHB2024 pp186–197; XPHB secondary cards checked2026-10-08.
 * https://5e.tools/races.html ; open primary species (all except Aasimar):
 * https://www.dndbeyond.com/sources/dnd/br-2024/character-origins
 * Aasimar card PHBp186 checked in 5etools data; separate transformation benefits.
 */
const speciesFacts = {
	aasimar: {
		page: 186,
		sizes: ["small", "medium"],
		speed: 30,
		benefits: [
			"celestial-resistance",
			"darkvision",
			"healing-hands",
			"light-bearer",
			"celestial-revelation.damage",
			"celestial-revelation.inner-radiance",
			"celestial-revelation.necrotic-shroud",
			"celestial-revelation.heavenly-wings",
		],
	},
	dragonborn: {
		page: 187,
		sizes: ["medium"],
		speed: 30,
		benefits: ["draconic-ancestry", "breath-weapon", "damage-resistance", "darkvision", "draconic-flight"],
	},
	dwarf: {
		page: 188,
		sizes: ["medium"],
		speed: 30,
		benefits: [
			"darkvision",
			"dwarven-resilience.resistance",
			"dwarven-resilience.saving-throws",
			"dwarven-toughness",
			"stonecunning",
		],
	},
	elf: {
		page: 189,
		sizes: ["medium"],
		speed: 30,
		benefits: ["darkvision", "elven-lineage.spells", "elven-lineage.speed", "fey-ancestry", "keen-senses", "trance"],
	},
	gnome: { page: 191, sizes: ["small"], speed: 30, benefits: ["darkvision", "gnomish-cunning", "gnomish-lineage"] },
	goliath: {
		page: 192,
		sizes: ["medium"],
		speed: 35,
		benefits: [
			"giant-ancestry.fire",
			"giant-ancestry.frost",
			"giant-ancestry.hill",
			"giant-ancestry.cloud",
			"giant-ancestry.stone",
			"giant-ancestry.storm",
			"large-form",
			"powerful-build",
		],
	},
	halfling: {
		page: 193,
		sizes: ["small"],
		speed: 30,
		benefits: ["brave", "halfling-nimbleness", "luck", "naturally-stealthy"],
	},
	human: { page: 194, sizes: ["small", "medium"], speed: 30, benefits: ["resourceful", "skillful", "versatile"] },
	orc: { page: 195, sizes: ["medium"], speed: 30, benefits: ["adrenaline-rush", "darkvision", "relentless-endurance"] },
	tiefling: {
		page: 197,
		sizes: ["small", "medium"],
		speed: 30,
		benefits: ["darkvision", "fiendish-legacy.spells", "fiendish-legacy.resistance", "otherworldly-presence"],
	},
} as const;
const supported = new Set([
	"aasimar.celestial-resistance",
	"aasimar.celestial-revelation.damage",
	"aasimar.celestial-revelation.inner-radiance",
	"dragonborn.draconic-ancestry",
	"dragonborn.damage-resistance",
	"dwarf.dwarven-toughness",
	"dwarf.dwarven-resilience.resistance",
	"elf.keen-senses",
	"elf.elven-lineage.speed",
	"tiefling.fiendish-legacy.resistance",
	"goliath.giant-ancestry.fire",
	"goliath.giant-ancestry.frost",
	"goliath.giant-ancestry.hill",
	"goliath.large-form",
	"halfling.luck",
	"human.resourceful",
	"human.skillful",
	"human.versatile",
]);
export type SpeciesMetadata = {
	readonly id: SpeciesId;
	readonly page: number;
	readonly sizes: readonly SpeciesSize[];
	readonly speed: number;
	readonly benefits: readonly BenefitMetadata[];
};
export const speciesMetadata: Readonly<Record<SpeciesId, SpeciesMetadata>> = Object.freeze(
	Object.fromEntries(
		Object.entries(speciesFacts).map(([id, f]) => [
			id,
			Object.freeze({
				id,
				page: f.page,
				sizes: Object.freeze([...f.sizes]),
				speed: f.speed,
				benefits: Object.freeze(
					f.benefits.map((benefit) => {
						const key = `${id}.${benefit}`;
						return Object.freeze({
							id: key,
							status: supported.has(key) ? "supported" : "unsupported",
							domain: supported.has(key)
								? "supported"
								: benefit.includes("necrotic-shroud")
									? "enemy-actions"
									: benefit === "breath-weapon"
										? "nonweapon"
										: benefit.includes("lineage") ||
												benefit.includes("legacy") ||
												benefit.includes("presence") ||
												benefit === "light-bearer"
											? "spells"
											: benefit === "darkvision" || benefit === "stonecunning" || benefit === "naturally-stealthy"
												? "vision"
												: benefit.includes("flight") ||
														benefit.includes("wings") ||
														benefit.includes("nimbleness") ||
														benefit.includes("cloud")
													? "movement"
													: benefit.includes("endurance") ||
															benefit.includes("resilience") ||
															benefit.includes("cunning") ||
															benefit === "brave" ||
															benefit.includes("resistance")
														? "defense"
														: benefit.includes("storm")
															? "enemy-actions"
															: "utility",
						} as BenefitMetadata);
					}),
				),
			}),
		]),
	) as Record<SpeciesId, SpeciesMetadata>,
);
export function selectedSpeciesBenefits(selection: SpeciesSelection, level = 20): readonly BenefitMetadata[] {
	return speciesMetadata[selection.id].benefits.filter(
		(benefit) =>
			!(level < 3 && benefit.id.startsWith("aasimar.celestial-revelation")) &&
			!(level < 5 && ["goliath.large-form", "dragonborn.draconic-flight"].includes(benefit.id)) &&
			!(selection.id === "elf" && selection.lineage !== "wood" && benefit.id === "elf.elven-lineage.speed") &&
			(selection.id !== "goliath" ||
				!benefit.id.includes(".giant-ancestry.") ||
				benefit.id.endsWith(`.${selection.ancestry}`)),
	);
}
export function speciesSize(selection: SpeciesSelection): SpeciesSize {
	return "size" in selection
		? (selection.size ?? "medium")
		: selection.id === "gnome" || selection.id === "halfling"
			? "small"
			: "medium";
}
export function validateSpeciesSelection(selection: SpeciesSelection): void {
	if (!selection || !Object.hasOwn(speciesMetadata, selection.id)) throw new Error("Unsupported species selection");
	if (!speciesMetadata[selection.id].sizes.includes(speciesSize(selection))) throw new Error("Invalid species size");
	const mental: readonly string[] = ["intelligence", "wisdom", "charisma"];
	if (
		(selection.id === "elf" || selection.id === "gnome" || selection.id === "tiefling") &&
		!mental.includes(selection.spellcastingAbility)
	)
		throw new Error("Invalid species spellcasting ability");
	if (selection.id === "goliath" && !["cloud", "fire", "frost", "hill", "stone", "storm"].includes(selection.ancestry))
		throw new Error("Invalid Giant Ancestry");
	if (selection.id === "dragonborn" && !Object.hasOwn(dragonDamageTypes, selection.ancestry))
		throw new Error("Invalid Draconic Ancestry");
	if (
		selection.id === "elf" &&
		(!["drow", "high", "wood"].includes(selection.lineage) ||
			!["insight", "perception", "survival"].includes(selection.keenSenses))
	)
		throw new Error("Invalid Elven Lineage or Keen Senses");
	if (selection.id === "gnome" && !["forest", "rock"].includes(selection.lineage))
		throw new Error("Invalid Gnomish Lineage");
	if (selection.id === "tiefling" && !["abyssal", "chthonic", "infernal"].includes(selection.legacy))
		throw new Error("Invalid Fiendish Legacy");
	if (selection.id === "human" && !skillIds.includes(selection.skill)) throw new Error("Invalid Human skill");
}
