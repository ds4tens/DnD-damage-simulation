import Barbarian from "../classes/Barbarian.ts";
import Berserker from "../classes/BarbarianSubclasses/Berserker.ts";
import WildHeart from "../classes/BarbarianSubclasses/WildHeart.ts";
import WorldTree from "../classes/BarbarianSubclasses/WorldTree.ts";
import Zealot from "../classes/BarbarianSubclasses/Zealot.ts";
import type { CombatantInput } from "../combat/CombatTypes.ts";
import type { DamageType } from "../combat/DamageTypes.ts";
import { resolveFeatSelections } from "../feats/FeatSelection.ts";
import { abilityScores, type FeatSelection, getFeatMetadata } from "../feats/FeatTypes.ts";
import { spellChoiceIndex } from "../feats/SpellChoiceIndex.ts";
import { armorCatalog, deriveArmorClass, deriveBarbarianHitPoints } from "../Items/Armor.ts";
import { Club, type WeaponCatalogId, weaponCatalog, weaponTypes2024 } from "../Items/Weapon/WeaponList.ts";
import BaseCharacter, { type TStatBlock } from "./BaseCharacter.ts";
import type { CharacterBuildSelection, LegalCharacterBuild } from "./CharacterBuildTypes.ts";
import { assessBenefitSupport, type DprSupportContext, summarizeBenefitSupport } from "./FeatureSupport.ts";
import {
	artisanToolIds,
	backgroundMetadata,
	dragonDamageTypes,
	gamingSetIds,
	musicalInstrumentIds,
	selectedSpeciesBenefits,
	speciesMetadata,
	speciesSize,
	validateSpeciesSelection,
} from "./Origins.ts";

export type {
	BarbarianSubclassId,
	CharacterBuildSelection,
	ConsumableStock,
	LegalCharacterBuild,
	ProgressionFeatChoice,
} from "./CharacterBuildTypes.ts";
export const buildRulesVersion = "phb-2024+srd-5.2.1+phb-errata-2.0";
const legalBuilds = new WeakSet<object>();
const pointCosts: Readonly<Record<number, number>> = Object.freeze({
	8: 0,
	9: 1,
	10: 2,
	11: 3,
	12: 4,
	13: 5,
	14: 7,
	15: 9,
});
const featLevels = [4, 8, 12, 16, 19] as const;
const classSkills: readonly string[] = [
	"animal-handling",
	"athletics",
	"intimidation",
	"nature",
	"perception",
	"survival",
];
export function validatePointBuy(stats: Readonly<TStatBlock>): void {
	if (
		!stats ||
		Object.keys(stats).length !== 6 ||
		Object.keys(stats).some((key) => !abilityScores.includes(key as (typeof abilityScores)[number]))
	)
		throw new Error("Point buy requires six ability scores");
	let total = 0;
	for (const ability of abilityScores) {
		const score = stats[ability];
		if (!Number.isInteger(score) || !Object.hasOwn(pointCosts, score))
			throw new Error("Point buy scores must be integers from 8 to 15");
		total += pointCosts[score] ?? 0;
	}
	if (total > 27) throw new Error("Point buy exceeds the 27-point budget");
}
function backgroundStats(selection: CharacterBuildSelection): TStatBlock {
	const bg = backgroundMetadata[selection.background.id];
	if (!bg) throw new Error("Unsupported background");
	const increases = selection.background.abilityScoreIncreases;
	if (
		!isArray(increases) ||
		new Set(increases.map((i) => i.abilityScore)).size !== increases.length ||
		increases.some((i) => !bg.abilityChoices.includes(i.abilityScore) || ![1, 2].includes(i.amount)) ||
		!(
			(increases.length === 2 && increases.some((i) => i.amount === 2) && increases.some((i) => i.amount === 1)) ||
			(increases.length === 3 && increases.every((i) => i.amount === 1))
		)
	)
		throw new Error("Invalid background ability score increases");
	const result = { ...selection.pointBuy };
	for (const i of increases) result[i.abilityScore] = Math.min(20, result[i.abilityScore] + i.amount);
	return result;
}
function validateEquipment(selection: CharacterBuildSelection, armorTraining: readonly string[]): void {
	const gear = selection.equipment;
	if (!gear || !Object.hasOwn(armorCatalog, gear.armorId) || typeof gear.shield !== "boolean" || !isArray(gear.weapons))
		throw new Error("Invalid equipment selection");
	if (
		gear.weapons.some((w) => !w.id || w.id === "$shield" || !Object.hasOwn(weaponTypes2024, w.weaponId)) ||
		new Set(gear.weapons.map((w) => w.id)).size !== gear.weapons.length
	)
		throw new Error("Invalid or duplicate weapon instance selection");
	const hands = gear.hands;
	if (!hands || Object.keys(hands).length !== 2 || !Object.hasOwn(hands, "left") || !Object.hasOwn(hands, "right"))
		throw new Error("Invalid initial hands");
	for (const value of Object.values(hands))
		if (value !== null && value !== "$shield" && !gear.weapons.some((w) => w.id === value))
			throw new Error("Unknown held weapon instance");
	const shieldHands = Object.values(hands).filter((value) => value === "$shield").length;
	if (shieldHands !== (gear.shield ? 1 : 0)) throw new Error("Shield selection must occupy exactly one actual hand");
	if (hands.left !== null && hands.left === hands.right) {
		const held = gear.weapons.find((w) => w.id === hands.left);
		if (
			!held ||
			(!weaponTypes2024[held.weaponId].properties.includes("two-handed") &&
				!weaponTypes2024[held.weaponId].properties.includes("versatile"))
		)
			throw new Error("The same instance cannot occupy two hands with this weapon");
	}
	// Two-Handed governs attacking, not merely holding the weapon (PHB2024 p213).
	// Armor training changes D20 penalties, not whether a creature may wear armor.
	if (gear.shield && !armorTraining.includes("shield")) throw new Error("Shield requires armor training");
}
function validateStock(selection: CharacterBuildSelection): void {
	const stock = selection.stock;
	if (stock === undefined) return;
	const valid = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
	if (stock.poisonDoses !== undefined && !valid(stock.poisonDoses)) throw new Error("Invalid explicit poison stock");
	for (const [kind, n] of Object.entries(stock.ammunition ?? {}))
		if (!["arrow", "bolt", "bullet", "needle"].includes(kind) || !valid(n))
			throw new Error("Invalid explicit ammunition stock");
	for (const [id, n] of Object.entries(stock.thrownWeapons ?? {}))
		if (
			!Object.hasOwn(weaponTypes2024, id) ||
			!weaponTypes2024[id as WeaponCatalogId].properties.includes("thrown") ||
			!valid(n)
		)
			throw new Error("Invalid explicit thrown weapon stock");
}
function freezeBuild<T>(value: T): T {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) freezeBuild(child);
		Object.freeze(value);
	}
	return value;
}
/** Full progression/selection validation. Raw BaseCharacter/buildCharacter remain isolated fixture APIs. */
export function buildLegalCharacter(raw: CharacterBuildSelection): LegalCharacterBuild {
	if (
		!raw ||
		raw.ruleset !== "phb-2024" ||
		raw.className !== "barbarian" ||
		!Number.isInteger(raw.level) ||
		raw.level < 1 ||
		raw.level > 20
	)
		throw new Error("Legal build requires pure Barbarian levels 1–20 and PHB2024");
	if (raw.level >= 3 && !raw.subclass) throw new Error("Barbarian subclass is required at level 3");
	if (raw.subclass !== undefined && !["berserker", "wild-heart", "world-tree", "zealot"].includes(raw.subclass))
		throw new Error("Unsupported Barbarian subclass");
	if (raw.level < 3 && raw.subclass !== undefined) throw new Error("Subclass is not available before level 3");
	validatePointBuy(raw.pointBuy);
	validateSpeciesSelection(raw.species);
	validateStock(raw);
	const selection = structuredClone(raw);
	const bg = backgroundMetadata[selection.background.id];
	if (!bg) throw new Error("Unsupported background");
	const initialStats = backgroundStats(selection);
	if (
		!isArray(selection.classSkills) ||
		selection.classSkills.length !== 2 ||
		new Set(selection.classSkills).size !== 2 ||
		selection.classSkills.some((skill) => !classSkills.includes(skill))
	)
		throw new Error("Barbarian requires two distinct class skill choices");
	const skills = [...bg.skills, ...selection.classSkills];
	if (selection.species.id === "human") skills.push(selection.species.skill);
	if (selection.species.id === "elf") {
		skills.push(selection.species.keenSenses);
		const elfCantrip = selection.species.highElfCantrip;
		if (
			selection.species.highElfCantrip !== undefined &&
			(selection.species.lineage !== "high" ||
				!spellChoiceIndex.some(
					(s) => s.id === elfCantrip && s.level === 0 && (s.lists as readonly string[]).includes("wizard"),
				))
		)
			throw new Error("Invalid High Elf cantrip");
	}
	if (selection.level < 3 && selection.primalKnowledgeSkill !== undefined)
		throw new Error("Primal Knowledge is not available before level3");
	if (
		selection.level >= 3 &&
		(!selection.primalKnowledgeSkill ||
			!classSkills.includes(selection.primalKnowledgeSkill) ||
			skills.includes(selection.primalKnowledgeSkill))
	)
		throw new Error("Primal Knowledge requires an additional Barbarian skill choice");
	let tool = bg.tool;
	if (tool.startsWith("any")) {
		const allowed: readonly string[] =
			tool === "anyArtisansTool"
				? artisanToolIds
				: tool === "anyMusicalInstrument"
					? musicalInstrumentIds
					: gamingSetIds;
		if (!selection.background.toolChoice || !allowed.includes(selection.background.toolChoice))
			throw new Error("Background requires a valid tool choice");
		tool = selection.background.toolChoice;
	} else if (selection.background.toolChoice !== undefined && selection.background.toolChoice !== tool)
		throw new Error("Background tool is fixed");
	const origin: FeatSelection = {
		name: bg.feat,
		acquiredAt: 1,
		...(selection.background.featChoices ? { choices: selection.background.featChoices } : {}),
	};
	if (bg.spellList) {
		if (origin.choices?.spellList !== bg.spellList) throw new Error("Background fixes the Magic Initiate spell list");
	}
	const feats: FeatSelection[] = [origin];
	if (selection.species.id === "human") {
		if (!selection.humanOriginFeat || getFeatMetadata(selection.humanOriginFeat.name).type !== "origin")
			throw new Error("Human requires an additional Origin feat");
		feats.push({ ...selection.humanOriginFeat, acquiredAt: 1 });
	} else if (selection.humanOriginFeat !== undefined) throw new Error("Only Human receives an extra Origin feat slot");
	const expected = featLevels.filter((level) => level <= selection.level);
	if (
		!isArray(selection.progression) ||
		selection.progression.length !== expected.length ||
		new Set(selection.progression.map((choice) => choice.level)).size !== expected.length ||
		selection.progression.some((choice) => !expected.includes(choice.level))
	)
		throw new Error("Invalid earned Barbarian feat slots");
	for (const level of expected) {
		const choice = selection.progression.find((choice) => choice.level === level);
		if (!choice) throw new Error("Missing progression choice");
		feats.push({ ...choice.feat, acquiredAt: level });
	}
	const baseContext = {
		armorTraining: ["light", "medium", "shield"] as const,
		savingThrowProficiencies: ["strength", "constitution"] as const,
		skills,
		tools: [tool],
	};
	if (selection.level >= 3) {
		const originOnly = feats.filter((feat) => feat.acquiredAt === 1);
		const originResolved = resolveFeatSelections({
			level: 1,
			stats: initialStats,
			feats: originOnly,
			context: baseContext,
		});
		const skill = selection.primalKnowledgeSkill;
		if (!skill || originResolved.skills.includes(skill))
			throw new Error("Primal Knowledge must grant an additional skill after Origin feats");
		skills.push(skill);
	}
	const resolved = resolveFeatSelections({ level: selection.level, stats: initialStats, feats, context: baseContext });
	validateEquipment(selection, resolved.armorTraining);
	const constructors = { berserker: Berserker, "wild-heart": WildHeart, "world-tree": WorldTree, zealot: Zealot };
	const characterClass = selection.subclass
		? new constructors[selection.subclass](weaponCatalog)
		: new Barbarian(weaponCatalog);
	const finalStats = { ...resolved.stats };
	if (selection.level === 20) {
		finalStats.strength = Math.min(25, finalStats.strength + 4);
		finalStats.constitution = Math.min(25, finalStats.constitution + 4);
	}
	const selectedNames = resolved.feats.map((feat) => feat.name);
	const featMasteredWeaponIds = resolved.feats.flatMap((feat) =>
		feat.name === "weapon-master" && feat.choices?.weaponMastery ? [feat.choices.weaponMastery as WeaponCatalogId] : [],
	);
	if (
		!isArray(selection.masteredWeaponIds) ||
		new Set(selection.masteredWeaponIds).size !== selection.masteredWeaponIds.length ||
		selection.masteredWeaponIds.length > characterClass.getWeaponMasteryCount(selection.level) ||
		selection.masteredWeaponIds.some(
			(id) => !Object.hasOwn(weaponTypes2024, id) || !characterClass.canUseWeaponMastery(weaponTypes2024[id]),
		)
	)
		throw new Error("Invalid class Weapon Mastery selections");
	const shield = selection.equipment.shield;
	const armorClass = deriveArmorClass(
		finalStats,
		selection.equipment.armorId,
		shield,
		selectedNames.includes("medium-armor-master"),
	);
	const hitPoints = deriveBarbarianHitPoints(finalStats, selection.level, {
		tough: selectedNames.includes("tough"),
		dwarf: selection.species.id === "dwarf",
		fortitude: selectedNames.includes("boon-of-fortitude"),
	});
	const weapon = selection.equipment.weapons[0] ? weaponTypes2024[selection.equipment.weapons[0].weaponId] : Club;
	const armor = armorCatalog[selection.equipment.armorId];
	const resistances: DamageType[] = [];
	if (selection.species.id === "aasimar") resistances.push("necrotic", "radiant");
	if (selection.species.id === "dwarf") resistances.push("poison");
	if (selection.species.id === "dragonborn") resistances.push(dragonDamageTypes[selection.species.ancestry]);
	if (selection.species.id === "tiefling")
		resistances.push(
			selection.species.legacy === "abyssal" ? "poison" : selection.species.legacy === "chthonic" ? "necrotic" : "fire",
		);
	for (const feat of resolved.feats)
		if (feat.name === "boon-of-energy-resistance")
			resistances.push(...((feat.choices?.damageTypes ?? []) as DamageType[]));
	const character = new BaseCharacter(
		selection.level,
		characterClass,
		weapon,
		"strength",
		initialStats,
		armorClass,
		hitPoints,
		feats,
		{
			defenses: { resistances: [...new Set(resistances)] },
			armorCategory: armor.category,
			armorTrained: armor.category === "none" || resolved.armorTraining.includes(armor.category),
			shieldEquipped: shield,
			medicineProficient: resolved.skills.includes("medicine"),
			featValidationContext: baseContext,
			buildData: {
				species: selection.species,
				size: speciesSize(selection.species),
				armorTraining: resolved.armorTraining,
				skills: resolved.skills,
				expertise: resolved.expertise,
				tools: resolved.tools,
				featMasteredWeaponIds,
				stock: selection.stock ?? {},
			},
		},
	);
	// Capstone is a class grant after the chronological feat pipeline, never a second application of feat ASI.
	character.stats = finalStats;
	character.speed =
		speciesMetadata[selection.species.id].speed +
		(selection.level >= 5 && armor.category !== "heavy" ? 10 : 0) +
		(selection.species.id === "elf" && selection.species.lineage === "wood" ? 5 : 0) -
		(finalStats.strength < armor.strengthRequirement ? 10 : 0) +
		(selectedNames.includes("speedy") ? 10 : 0) +
		(selectedNames.includes("boon-of-speed") ? 30 : 0);
	const benefits = [
		...resolved.feats.flatMap((feat) => getFeatMetadata(feat.name).benefits),
		...selectedSpeciesBenefits(selection.species, selection.level),
	];
	const report = summarizeBenefitSupport(benefits);
	const combatDefaults: Omit<CombatantInput, "id" | "definition"> = {
		weapons: selection.equipment.weapons.map((instance) => ({
			id: instance.id,
			weapon: weaponTypes2024[instance.weaponId],
		})),
		initialHands: { ...selection.equipment.hands },
		masteredWeaponIds: [...new Set([...selection.masteredWeaponIds, ...featMasteredWeaponIds])],
		initialClassState: { armorCategory: armor.category },
		size: speciesSize(selection.species),
	};
	const build: LegalCharacterBuild = {
		validation: "legal-phb-2024",
		rulesVersion: buildRulesVersion,
		selection,
		character,
		report,
		combatDefaults,
	};
	const detached = detachGraph(build);
	freezeBuild(detached);
	legalBuilds.add(detached);
	return detached;
}
export function assertLegalCharacterBuild(value: unknown): asserts value is LegalCharacterBuild {
	if (typeof value !== "object" || value === null || !legalBuilds.has(value))
		throw new Error("A factory-validated legal character build is required; revalidate serialized selections");
}
export function combatantInputForBuild(build: LegalCharacterBuild, id: string): CombatantInput {
	assertLegalCharacterBuild(build);
	if (!id) throw new Error("Empty combatant ID");
	return { id, definition: build.character, ...build.combatDefaults };
}
export function assessBuildSupport(
	build: LegalCharacterBuild,
	context: DprSupportContext = {},
): ReturnType<typeof assessBenefitSupport> {
	assertLegalCharacterBuild(build);
	return assessBenefitSupport(
		[
			...build.character.feats.flatMap((feat) => getFeatMetadata(feat.name).benefits),
			...selectedSpeciesBenefits(build.selection.species, build.selection.level),
		],
		context,
	);
}

function isArray(value: unknown): boolean {
	return Array.isArray(value);
}

function detachGraph<T>(value: T, seen = new WeakMap<object, unknown>()): T {
	if (value === null || typeof value !== "object") return value;
	if (seen.has(value)) return seen.get(value) as T;
	const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
	seen.set(value, copy);
	for (const key of Reflect.ownKeys(value)) {
		const d = Object.getOwnPropertyDescriptor(value, key);
		if (!d) continue;
		if ("value" in d) d.value = detachGraph(d.value, seen);
		Object.defineProperty(copy, key, d);
	}
	return copy as T;
}
