import type { TStatBlock } from "../character/BaseCharacter.ts";
import type { ArmorTraining } from "../feats/FeatTypes.ts";
export type ArmorCategory = "none" | "light" | "medium" | "heavy";
export type ArmorMetadata = {
	readonly id: ArmorCatalogId;
	readonly displayName: string;
	readonly category: ArmorCategory;
	readonly baseAc: number;
	readonly dexterityCap: number | null;
	readonly strengthRequirement: number;
	readonly stealthDisadvantage: boolean;
	readonly priceGp: number;
	readonly weightLb: number;
};
const facts = [
	["none", "Unarmored", "none", 10, null, 0, false, 0, 0],
	["padded", "Padded", "light", 11, null, 0, true, 5, 8],
	["leather", "Leather", "light", 11, null, 0, false, 10, 10],
	["studded-leather", "Studded Leather", "light", 12, null, 0, false, 45, 13],
	["hide", "Hide", "medium", 12, 2, 0, false, 10, 12],
	["chain-shirt", "Chain Shirt", "medium", 13, 2, 0, false, 50, 20],
	["scale-mail", "Scale Mail", "medium", 14, 2, 0, true, 50, 45],
	["breastplate", "Breastplate", "medium", 14, 2, 0, false, 400, 20],
	["half-plate", "Half Plate", "medium", 15, 2, 0, true, 750, 40],
	["ring-mail", "Ring Mail", "heavy", 14, 0, 0, true, 30, 40],
	["chain-mail", "Chain Mail", "heavy", 16, 0, 13, true, 75, 55],
	["splint", "Splint", "heavy", 17, 0, 15, true, 200, 60],
	["plate", "Plate", "heavy", 18, 0, 15, true, 1500, 65],
] as const;
export type ArmorCatalogId = (typeof facts)[number][0];
/** BasicRules2024 / SRD5.2.1 Equipment: Armor table; checked2026-10-08.
 * https://www.dndbeyond.com/sources/dnd/br-2024/equipment#Armor
 * Unarmored Defense: Barbarian class (10 +DEXmod+CONmod; Shield permitted).
 */
export const armorCatalog: Readonly<Record<ArmorCatalogId, ArmorMetadata>> = Object.freeze(
	Object.fromEntries(
		facts.map(
			([
				id,
				displayName,
				category,
				baseAc,
				dexterityCap,
				strengthRequirement,
				stealthDisadvantage,
				priceGp,
				weightLb,
			]) => [
				id,
				Object.freeze({
					id,
					displayName,
					category,
					baseAc,
					dexterityCap,
					strengthRequirement,
					stealthDisadvantage,
					priceGp,
					weightLb,
				}),
			],
		),
	) as Record<ArmorCatalogId, ArmorMetadata>,
);
export const shieldMetadata = Object.freeze({
	armorClassBonus: 2,
	training: "shield" as ArmorTraining,
	priceGp: 10,
	weightLb: 6,
	hands: 1,
});
export function deriveArmorClass(
	stats: TStatBlock,
	armorId: ArmorCatalogId,
	shield: boolean,
	mediumArmorMaster = false,
): number {
	const armor = armorCatalog[armorId];
	if (!armor) throw new Error("Unsupported armor selection");
	const dex = Math.floor((stats.dexterity - 10) / 2);
	const con = Math.floor((stats.constitution - 10) / 2);
	const dexBonus =
		armor.category === "heavy"
			? 0
			: armor.dexterityCap === null
				? dex
				: Math.min(dex, armor.category === "medium" && mediumArmorMaster ? 3 : armor.dexterityCap);
	return armor.baseAc + dexBonus + (armor.category === "none" ? Math.max(0, con) : 0) + (shield ? 2 : 0);
}
export function deriveBarbarianHitPoints(
	stats: TStatBlock,
	level: number,
	options: { tough?: boolean; dwarf?: boolean; fortitude?: boolean } = {},
): number {
	const con = Math.floor((stats.constitution - 10) / 2);
	return (
		Math.max(1, 12 + con) +
		(level - 1) * Math.max(1, 7 + con) +
		(options.tough ? level * 2 : 0) +
		(options.dwarf ? level : 0) +
		(options.fortitude ? 40 : 0)
	);
}
