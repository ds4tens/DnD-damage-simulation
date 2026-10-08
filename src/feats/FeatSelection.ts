import type { TStatBlock, TStatsType } from "../character/BaseCharacter.ts";
import { musicalInstrumentIds, skillIds, toolIds } from "../character/Origins.ts";
import { weaponTypes2024 } from "../Items/Weapon/WeaponList.ts";
import { applyFeatAbilityScoreImprovement } from "./AbilityScoreImprovement.ts";
import {
	type ArmorTraining,
	abilityScores,
	type FeatChoices,
	type FeatSelection,
	getFeatMetadata,
	type NamedFeature,
	type ValidatedFeatSelection,
} from "./FeatTypes.ts";
import { spellChoiceIndex } from "./SpellChoiceIndex.ts";

export type FeatValidationContext = {
	features?: readonly NamedFeature[];
	armorTraining?: readonly ArmorTraining[];
	savingThrowProficiencies?: readonly TStatsType[];
	skills?: readonly string[];
	expertise?: readonly string[];
	tools?: readonly string[];
};
export function canonicalChoice(value: string): string {
	return value
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/^-|-$/g, "");
}
function distinctChoices(
	values: readonly string[] | undefined,
	allowed: readonly string[],
	count: number,
	description: string,
): string[] {
	if (!values || !isArray(values) || values.length !== count || values.some((v) => typeof v !== "string"))
		throw new Error(`Invalid ${description} choices`);
	const normalized = values.map(canonicalChoice);
	if (new Set(normalized).size !== count || normalized.some((v) => !allowed.includes(v)))
		throw new Error(`Invalid ${description} choices`);
	return normalized;
}
function spellChoices(
	values: readonly string[] | undefined,
	count: number,
	filter: (spell: (typeof spellChoiceIndex)[number]) => boolean,
	description: string,
): string[] {
	return distinctChoices(
		values,
		spellChoiceIndex.filter(filter).map((s) => s.id),
		count,
		description,
	);
}
export function validateFeatChoices(
	selection: FeatSelection,
	context: FeatValidationContext,
	level: number,
): FeatChoices | undefined {
	const raw = selection.choices ?? {};
	const allowedKeys: string[] = [];
	const result: FeatChoices = {};
	const key = (name: keyof FeatChoices) => allowedKeys.push(name);
	if (selection.name === "magic-initiate") {
		key("spellList");
		key("spellcastingAbility");
		key("cantrips");
		key("spells");
		if (
			!raw.spellList ||
			!["cleric", "druid", "wizard"].includes(raw.spellList) ||
			!raw.spellcastingAbility ||
			!["intelligence", "wisdom", "charisma"].includes(raw.spellcastingAbility)
		)
			throw new Error("Invalid Magic Initiate list or spellcasting ability");
		result.spellList = raw.spellList;
		result.spellcastingAbility = raw.spellcastingAbility;
		result.cantrips = spellChoices(
			raw.cantrips,
			2,
			(s) => s.level === 0 && (s.lists as readonly string[]).includes(raw.spellList ?? ""),
			"Magic Initiate cantrip",
		);
		result.spells = spellChoices(
			raw.spells,
			1,
			(s) => s.level === 1 && (s.lists as readonly string[]).includes(raw.spellList ?? ""),
			"Magic Initiate spell",
		);
	}
	if (selection.name === "fey-touched" || selection.name === "shadow-touched") {
		key("spells");
		const schools: readonly string[] = selection.name === "fey-touched" ? ["D", "E"] : ["I", "N"];
		result.spells = spellChoices(raw.spells, 1, (s) => s.level === 1 && schools.includes(s.school), selection.name);
	}
	if (selection.name === "ritual-caster") {
		key("spells");
		result.spells = spellChoices(
			raw.spells,
			Math.ceil(level / 4) + 1,
			(s) => s.level === 1 && s.ritual,
			"Ritual Caster",
		);
	}
	if (selection.name === "skilled") {
		key("skills");
		key("tools");
		const skills = distinctChoices(raw.skills ?? [], skillIds, raw.skills?.length ?? 0, "Skilled skill");
		const tools = distinctChoices(raw.tools ?? [], toolIds, raw.tools?.length ?? 0, "Skilled tool");
		if (skills.length + tools.length !== 3) throw new Error("Skilled requires three skill/tool choices");
		result.skills = skills;
		result.tools = tools;
	}
	if (selection.name === "crafter" || selection.name === "musician") {
		key("tools");
		const allowed: readonly string[] =
			selection.name === "musician"
				? musicalInstrumentIds
				: [
						"carpenter-s-tools",
						"leatherworker-s-tools",
						"mason-s-tools",
						"potter-s-tools",
						"smith-s-tools",
						"tinker-s-tools",
						"weaver-s-tools",
						"woodcarver-s-tools",
					];
		result.tools = distinctChoices(raw.tools, allowed, 3, selection.name);
	}
	if (selection.name === "chef") {
		// The feat grants Cook's Utensils without a choice.
		result.tools = ["cook-s-utensils"];
	}
	if (selection.name === "skill-expert") {
		key("skills");
		key("expertise");
		result.skills = distinctChoices(raw.skills, skillIds, 1, "Skill Expert skill");
		if (
			!raw.expertise ||
			![...(context.skills ?? []), ...result.skills].includes(canonicalChoice(raw.expertise)) ||
			(context.expertise ?? []).includes(canonicalChoice(raw.expertise))
		)
			throw new Error("Invalid Skill Expert expertise");
		result.expertise = canonicalChoice(raw.expertise);
	}
	if (selection.name === "keen-mind" || selection.name === "observant") {
		key("skills");
		const allowed =
			selection.name === "keen-mind"
				? ["arcana", "history", "investigation", "nature", "religion"]
				: ["insight", "investigation", "perception"];
		result.skills = distinctChoices(raw.skills, allowed, 1, selection.name);
		const chosen = result.skills[0];
		if (chosen && context.skills?.includes(chosen)) result.expertise = chosen;
	}
	if (selection.name === "boon-of-skill") {
		key("expertise");
		if (
			!raw.expertise ||
			!(skillIds as readonly string[]).includes(canonicalChoice(raw.expertise)) ||
			(context.expertise ?? []).includes(canonicalChoice(raw.expertise))
		)
			throw new Error("Invalid Boon of Skill expertise");
		result.expertise = canonicalChoice(raw.expertise);
	}
	if (selection.name === "weapon-master") {
		key("weaponMastery");
		const id = raw.weaponMastery;
		if (!id || !Object.hasOwn(weaponTypes2024, id)) throw new Error("Invalid Weapon Master choice");
		result.weaponMastery = id;
	}
	if (selection.name === "elemental-adept" || selection.name === "boon-of-energy-resistance") {
		key("damageTypes");
		result.damageTypes = distinctChoices(
			raw.damageTypes,
			selection.name === "elemental-adept"
				? ["acid", "cold", "fire", "lightning", "thunder"]
				: ["acid", "cold", "fire", "lightning", "necrotic", "poison", "psychic", "radiant", "thunder"],
			selection.name === "elemental-adept" ? 1 : 2,
			selection.name,
		);
	}
	if (Object.keys(raw).some((k) => !allowedKeys.includes(k))) throw new Error(`Unknown choice for ${selection.name}`);
	return Object.keys(result).length ? result : undefined;
}
/** Local/sequential validation; the legal builder additionally checks earned slots and point buy. */
export function resolveFeatSelections(input: {
	level: number;
	stats: TStatBlock;
	feats: readonly FeatSelection[];
	context?: FeatValidationContext;
}): {
	stats: TStatBlock;
	feats: ValidatedFeatSelection[];
	armorTraining: ArmorTraining[];
	savingThrowProficiencies: TStatsType[];
	skills: string[];
	expertise: string[];
	tools: string[];
} {
	if (!Number.isInteger(input.level) || input.level < 1 || input.level > 20) throw new Error("Invalid character level");
	for (const ability of abilityScores)
		if (!Number.isInteger(input.stats[ability]) || input.stats[ability] < 1 || input.stats[ability] > 30)
			throw new Error(`Invalid ability score: ${ability}`);
	if (!isArray(input.feats)) throw new Error("Invalid feat selections");
	let stats = { ...input.stats };
	const feats: ValidatedFeatSelection[] = [];
	const armorTraining = [...(input.context?.armorTraining ?? [])];
	const savingThrowProficiencies = [...(input.context?.savingThrowProficiencies ?? [])];
	const skills = [...(input.context?.skills ?? [])];
	const expertise = [...(input.context?.expertise ?? [])];
	const tools = [...(input.context?.tools ?? [])];
	for (const selection of input.feats) {
		if (!selection || typeof selection !== "object") throw new Error("Invalid feat selection");
		const rule = getFeatMetadata(selection.name);
		if (selection.type !== undefined && selection.type !== rule.type)
			throw new Error(`Invalid feat category for ${rule.name}`);
		const acquiredAt = selection.acquiredAt ?? input.level;
		if (!Number.isInteger(acquiredAt) || acquiredAt < 1 || acquiredAt > input.level || acquiredAt < rule.minimumLevel)
			throw new Error(`${rule.displayName} requires level ${rule.minimumLevel}`);
		if (rule.minimumStrength !== undefined && stats.strength < rule.minimumStrength)
			throw new Error(`${rule.displayName} requires Strength ${rule.minimumStrength} before its increase`);
		if (rule.abilityPrerequisites.length && !rule.abilityPrerequisites.some((p) => stats[p.ability] >= p.min))
			throw new Error(`Ability prerequisite not met before increase for ${rule.displayName}`);
		if (
			rule.requiredFeaturesAnyOf.length &&
			!rule.requiredFeaturesAnyOf.some((f) => input.context?.features?.includes(f))
		)
			throw new Error(`Required named feature missing for ${rule.displayName}`);
		if (rule.armorPrerequisite && !armorTraining.includes(rule.armorPrerequisite))
			throw new Error(`Armor training prerequisite missing for ${rule.displayName}`);
		const previous = feats.filter((f) => f.name === selection.name);
		if (previous.length && !rule.repeatable) throw new Error(`Feat is not repeatable: ${rule.name}`);
		const choices = validateFeatChoices(
			selection,
			{ ...input.context, armorTraining, savingThrowProficiencies, skills, expertise, tools },
			input.level,
		);
		if (rule.name === "magic-initiate" && previous.some((f) => f.choices?.spellList === choices?.spellList))
			throw new Error("Repeated Magic Initiate must use a different spell list");
		if (
			rule.name === "elemental-adept" &&
			previous.some((f) => f.choices?.damageTypes?.[0] === choices?.damageTypes?.[0])
		)
			throw new Error("Repeated Elemental Adept must use a different damage type");
		if (
			rule.name === "resilient" &&
			selection.abilityScoreImprovement?.some((f) => savingThrowProficiencies.includes(f.abilityScore))
		)
			throw new Error("Resilient requires an ability lacking saving throw proficiency");
		stats = applyFeatAbilityScoreImprovement(rule.name, stats, selection.abilityScoreImprovement);
		if (rule.name === "heavily-armored") armorTraining.push("heavy");
		if (rule.name === "lightly-armored") armorTraining.push("light", "shield");
		if (rule.name === "moderately-armored") armorTraining.push("medium");
		if (rule.name === "resilient")
			for (const choice of selection.abilityScoreImprovement ?? []) savingThrowProficiencies.push(choice.abilityScore);
		if (rule.name === "boon-of-skill") skills.push(...skillIds);
		skills.push(...(choices?.skills ?? []));
		tools.push(...(choices?.tools ?? []));
		if (choices?.expertise) expertise.push(choices.expertise);
		feats.push({
			name: rule.name,
			type: rule.type,
			...(selection.acquiredAt === undefined ? {} : { acquiredAt: selection.acquiredAt }),
			...(selection.abilityScoreImprovement === undefined
				? {}
				: { abilityScoreImprovement: selection.abilityScoreImprovement.map((choice) => ({ ...choice })) }),
			...(choices ? { choices } : {}),
		});
	}
	return {
		stats,
		feats,
		armorTraining: [...new Set(armorTraining)],
		savingThrowProficiencies: [...new Set(savingThrowProficiencies)],
		skills: [...new Set(skills)],
		expertise: [...new Set(expertise)],
		tools: [...new Set(tools)],
	};
}

function isArray(value: unknown): boolean {
	return Array.isArray(value);
}
