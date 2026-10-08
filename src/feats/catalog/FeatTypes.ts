import type { TStatsType } from "../../character/BaseCharacter.ts";
import type { BenefitMetadata } from "../../character/support/FeatureSupport.ts";
import { type FeatCatalogId, featCatalogFacts } from "./FeatCatalogFacts.ts";

export enum EFeatName {
	ABILITY_SCORE_IMPROVEMENT = "ability-score-improvement",
	SAVAGE_ATTACKER = "savage-attacker",
	PIERCER = "piercer",
	SLASHER = "slasher",
	GREAT_WEAPON_MASTER = "great-weapon-master",
}
export type FeatName = FeatCatalogId;
export type FeatCategory = "origin" | "general" | "fighting-style" | "epic-boon";
export type NamedFeature = "Spellcasting" | "Pact Magic" | "Fighting Style";
export type ArmorTraining = "light" | "medium" | "heavy" | "shield";
export type AbilityScoreIncrease = { abilityScore: TStatsType; amount: number };
/** Choice keys are canonical; unknown keys and missing required choices are rejected. */
export type FeatChoices = {
	spellList?: "cleric" | "druid" | "wizard";
	spellcastingAbility?: "intelligence" | "wisdom" | "charisma";
	cantrips?: readonly string[];
	spells?: readonly string[];
	skills?: readonly string[];
	tools?: readonly string[];
	expertise?: string;
	weaponMastery?: string;
	damageTypes?: readonly string[];
};
export type FeatSelection = {
	name: FeatName;
	/** Acquisition level is informational for raw fixtures; earned slots are checked by the legal builder. */
	acquiredAt?: number;
	type?: FeatCategory;
	abilityScoreImprovement?: readonly AbilityScoreIncrease[];
	choices?: FeatChoices;
};
export type ValidatedFeatSelection = Omit<FeatSelection, "type"> & { type: FeatCategory };
export type FeatMetadata = {
	readonly name: FeatName;
	readonly displayName: string;
	readonly type: FeatCategory;
	readonly repeatable: boolean;
	readonly minimumLevel: number;
	readonly minimumStrength?: number;
	readonly abilityPrerequisites: readonly { readonly ability: TStatsType; readonly min: number }[];
	readonly requiredFeaturesAnyOf: readonly NamedFeature[];
	readonly armorPrerequisite?: ArmorTraining;
	readonly abilityScoreImprovement: {
		readonly pattern: "two-points" | "one-point" | "none";
		readonly allowedAbilityScores: readonly TStatsType[];
		readonly maximumScore: 20 | 30;
	};
	readonly benefits: readonly BenefitMetadata[];
	readonly source: { readonly book: "PHB 2024"; readonly page: number; readonly url: string; readonly checked: string };
};
export const abilityScores: readonly TStatsType[] = Object.freeze([
	"strength",
	"dexterity",
	"constitution",
	"intelligence",
	"wisdom",
	"charisma",
]);
const supportedBenefits: Record<string, readonly string[]> = {
	"ability-score-improvement": [],
	"savage-attacker": ["weapon-damage"],
	piercer: ["puncture", "enhanced-critical"],
	slasher: ["hamstring", "enhanced-critical"],
	"great-weapon-master": ["heavy-weapon-mastery", "hew"],
	lucky: ["luck-points", "advantage"],
	"tavern-brawler": ["enhanced-unarmed-strike", "damage-rerolls"],
	crusher: ["enhanced-critical"],
	"dual-wielder": ["enhanced-dual-wielding", "quick-draw"],
	"polearm-master": ["pole-strike"],
	grappler: ["punch-and-grab", "attack-advantage"],
	"shield-master": ["shield-bash"],
	"weapon-master": ["mastery-property"],
	"crossbow-expert": ["ignore-loading", "firing-in-melee", "dual-wielding"],
	sharpshooter: ["firing-in-melee", "long-shots"],
	poisoner: ["potent-poison", "brew-poison"],
	"boon-of-combat-prowess": ["peerless-aim"],
	"boon-of-fate": ["improve-fate"],
	"boon-of-irresistible-offense": ["overcome-defenses", "overwhelming-strike"],
	"martial-weapon-training": ["weapon-proficiency"],
	"heavily-armored": ["armor-training"],
	"lightly-armored": ["armor-training"],
	"moderately-armored": ["armor-training"],
	"medium-armor-master": ["dexterous-wearer"],
	resilient: ["saving-throw-proficiency"],
	tough: ["hit-point-maximum"],
	"boon-of-fortitude": ["fortified-health"],
	"boon-of-energy-resistance": ["energy-resistances"],
	"boon-of-skill": ["all-around-adept", "expertise"],
	"keen-mind": ["lore-knowledge"],
	observant: ["keen-observer"],
	"skill-expert": ["skill-proficiency", "expertise"],
	skilled: ["skill-tool-proficiency"],
	crafter: ["tool-proficiency"],
	musician: ["instrument-training"],
	chef: ["cook-s-utensils"],
	alert: ["initiative-proficiency"],
	speedy: ["speed-increase"],
	"boon-of-speed": ["quickness"],
};
const benefitDomains: Record<string, BenefitMetadata["domain"]> = {
	"bypass-cover": "cover",
	"charge-attack": "movement",
	"improved-dash": "movement",
	push: "movement",
	"fast-wrestler": "movement",
	"reactive-strike": "enemy-actions",
	guardian: "enemy-actions",
	halt: "enemy-actions",
	parry: "defense",
	"interpose-shield": "defense",
	disadvantage: "enemy-actions",
	"energy-redirection": "enemy-actions",
	"merge-with-shadows": "vision",
	blindsight: "vision",
	truesight: "vision",
	"fog-of-war": "vision",
	sniper: "vision",
	"fey-magic": "spells",
	"shadow-magic": "spells",
	"two-cantrips": "spells",
	"level-1-spell": "spells",
	"spell-change": "spells",
	"ritual-spells": "spells",
	"quick-ritual": "spells",
	"free-casting": "spells",
	"minor-telekinesis": "spells",
	"detect-thoughts": "spells",
	"encouraging-song": "allies",
	"initiative-swap": "allies",
	"telekinetic-shove": "movement",
	"mounted-strike": "movement",
	"leap-aside": "defense",
	veer: "defense",
	"damage-reduction": "defense",
	"guarded-mind": "defense",
	"concentration-breaker": "spells",
	"last-stand": "defense",
	"recover-vitality": "defense",
	"shadowy-form": "defense",
};
const offensiveBenefits = new Set([
	"savage-attacker.weapon-damage",
	"piercer.puncture",
	"piercer.enhanced-critical",
	"slasher.hamstring",
	"great-weapon-master.heavy-weapon-mastery",
	"great-weapon-master.hew",
	"lucky.luck-points",
	"lucky.advantage",
	"tavern-brawler.enhanced-unarmed-strike",
	"tavern-brawler.damage-rerolls",
	"crusher.enhanced-critical",
	"dual-wielder.enhanced-dual-wielding",
	"dual-wielder.quick-draw",
	"polearm-master.pole-strike",
	"grappler.punch-and-grab",
	"grappler.attack-advantage",
	"shield-master.shield-bash",
	"weapon-master.mastery-property",
	"crossbow-expert.ignore-loading",
	"crossbow-expert.firing-in-melee",
	"crossbow-expert.dual-wielding",
	"sharpshooter.firing-in-melee",
	"sharpshooter.long-shots",
	"poisoner.potent-poison",
	"poisoner.brew-poison",
	"boon-of-combat-prowess.peerless-aim",
	"boon-of-fate.improve-fate",
	"boon-of-irresistible-offense.overcome-defenses",
	"boon-of-irresistible-offense.overwhelming-strike",
]);
export const featMetadata: Readonly<Record<FeatName, FeatMetadata>> = Object.freeze(
	Object.fromEntries(
		featCatalogFacts.map((fact): [FeatName, FeatMetadata] => {
			const supported = supportedBenefits[fact.id] ?? [];
			const names = fact.benefits.length
				? fact.benefits
				: fact.id === "savage-attacker"
					? ["weapon-damage"]
					: fact.id === "skilled"
						? ["skill-tool-proficiency"]
						: fact.id === "tough"
							? ["hit-point-maximum"]
							: [];
			const benefits: BenefitMetadata[] = names.map((id) =>
				Object.freeze({
					id: `${fact.id}.${id}`,
					status: supported.includes(id) ? "supported" : "unsupported",
					domain: offensiveBenefits.has(`${fact.id}.${id}`)
						? "offense"
						: supported.includes(id)
							? "supported"
							: (benefitDomains[id] ?? "utility"),
				}),
			);
			if (fact.abilityPoints > 0)
				benefits.unshift(
					Object.freeze({ id: `${fact.id}.ability-score-increase`, status: "supported", domain: "supported" }),
				);
			// A named printed benefit can combine applicable and excluded effects.
			// Keep the useful rule active while explicitly exposing its other branch.
			const extra: Partial<Record<FeatName, readonly BenefitMetadata[]>> = {
				"shield-master": [{ id: "shield-master.shield-bash.push", status: "unsupported", domain: "movement" }],
				poisoner: [
					{ id: "poisoner.brew-poison.crafting", status: "unsupported", domain: "utility" },
					{ id: "poisoner.brew-poison.poisoned-ability-checks", status: "unsupported", domain: "enemy-actions" },
					{ id: "poisoner.brew-poison.poisoned-condition-snapshot", status: "unsupported", domain: "utility" },
				],
				"boon-of-fortitude": [
					{ id: "boon-of-fortitude.fortified-health.healing", status: "unsupported", domain: "defense" },
				],
			};
			benefits.push(...(extra[fact.id] ?? []).map((benefit) => Object.freeze(benefit)));
			const requiredFeaturesAnyOf: readonly NamedFeature[] =
				fact.requiredFeature === "spellcasting-or-pact-magic"
					? ["Spellcasting", "Pact Magic"]
					: fact.requiredFeature === "spellcasting"
						? ["Spellcasting"]
						: fact.requiredFeature === "fighting-style"
							? ["Fighting Style"]
							: [];
			return [
				fact.id,
				Object.freeze({
					name: fact.id,
					displayName: fact.name,
					type: fact.category,
					repeatable: fact.repeatable,
					minimumLevel: fact.level,
					...(fact.id === "great-weapon-master" ? { minimumStrength: 13 } : {}),
					abilityPrerequisites: Object.freeze(fact.abilityPrerequisites.map((entry) => Object.freeze({ ...entry }))),
					requiredFeaturesAnyOf: Object.freeze(requiredFeaturesAnyOf),
					...(fact.armorPrerequisite ? { armorPrerequisite: fact.armorPrerequisite } : {}),
					abilityScoreImprovement: Object.freeze({
						pattern: fact.abilityPoints === 2 ? "two-points" : fact.abilityPoints === 1 ? "one-point" : "none",
						allowedAbilityScores: Object.freeze([...fact.abilityChoices]),
						maximumScore: fact.cap,
					}),
					benefits: Object.freeze(benefits),
					source: Object.freeze({
						book: "PHB 2024",
						page: fact.page,
						url: `https://5e.tools/feats.html#${encodeURIComponent(fact.name.toLowerCase())}_xphb`,
						checked: "2026-10-08",
					}),
				}),
			];
		}),
	) as Record<FeatName, FeatMetadata>,
);
export function getFeatMetadata(name: FeatName): FeatMetadata {
	if (!Object.hasOwn(featMetadata, name)) throw new Error(`Unsupported feat selection: ${name}`);
	return featMetadata[name];
}
