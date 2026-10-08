import type { DamageType } from "../../combat/damage/DamageTypes.ts";
import Dice from "../../dice/dice.ts";
import Weapon, { type WeaponCombatMetadata, type WeaponProficiencyCategory } from "./Weapon.ts";
import { EWeaponMastery, type TWeaponMastery } from "./WeaponMastery.ts";

/** Basic Rules 2024 Equipment / SRD 5.2.1 pp.89–91; PHB errata v2.0.
 * https://www.dndbeyond.com/sources/dnd/br-2024/equipment#Weapons
 * Verified 2026-10-08. Price is GP; weight is lb. Net is adventuring gear in 2024.
 */
function weapon(
	name: string,
	proficiencyCategory: WeaponProficiencyCategory,
	dice: readonly number[],
	damageType: DamageType,
	mastery: TWeaponMastery,
	weight: number,
	price: number,
	metadata: WeaponCombatMetadata,
): Weapon {
	return new Weapon(
		name,
		"Basic Rules 2024 / SRD 5.2.1, Equipment: Weapons table.",
		proficiencyCategory,
		"common",
		price,
		weight,
		"medium",
		dice.map((sides) => new Dice(sides)),
		damageType,
		mastery,
		{ ...metadata, proficiencyCategory },
	);
}
const melee = { category: "melee" } as const;
const ranged = { category: "ranged" } as const;
const thrown20 = { normal: 20, long: 60 } as const;

export const Club = weapon("Club", "simple", [4], "bludgeoning", EWeaponMastery.SLOW, 2, 0.1, {
	...melee,
	properties: ["light"],
});
export const Dagger = weapon("Dagger", "simple", [4], "piercing", EWeaponMastery.NICK, 1, 2, {
	...melee,
	properties: ["finesse", "light", "thrown"],
	range: thrown20,
});
export const Greatclub = weapon("Greatclub", "simple", [8], "bludgeoning", EWeaponMastery.PUSH, 10, 0.2, {
	...melee,
	properties: ["two-handed"],
});
export const Handaxe = weapon("Handaxe", "simple", [6], "slashing", EWeaponMastery.VEX, 2, 5, {
	...melee,
	properties: ["light", "thrown"],
	range: thrown20,
});
export const Javelin = weapon("Javelin", "simple", [6], "piercing", EWeaponMastery.SLOW, 2, 0.5, {
	...melee,
	properties: ["thrown"],
	range: { normal: 30, long: 120 },
});
export const LightHammer = weapon("Light Hammer", "simple", [4], "bludgeoning", EWeaponMastery.NICK, 2, 2, {
	...melee,
	properties: ["light", "thrown"],
	range: thrown20,
});
export const Mace = weapon("Mace", "simple", [6], "bludgeoning", EWeaponMastery.SAP, 4, 5, melee);
export const Quarterstaff = weapon("Quarterstaff", "simple", [6], "bludgeoning", EWeaponMastery.TOPPLE, 4, 0.2, {
	...melee,
	properties: ["versatile"],
	versatileDamage: [8],
});
export const Sickle = weapon("Sickle", "simple", [4], "slashing", EWeaponMastery.NICK, 2, 1, {
	...melee,
	properties: ["light"],
});
export const Spear = weapon("Spear", "simple", [6], "piercing", EWeaponMastery.SAP, 3, 1, {
	...melee,
	properties: ["thrown", "versatile"],
	range: thrown20,
	versatileDamage: [8],
});
export const Dart = weapon("Dart", "simple", [4], "piercing", EWeaponMastery.VEX, 0.25, 0.05, {
	...ranged,
	properties: ["finesse", "thrown"],
	range: thrown20,
});
export const LightCrossbow = weapon("Light Crossbow", "simple", [8], "piercing", EWeaponMastery.SLOW, 5, 25, {
	...ranged,
	properties: ["ammunition", "loading", "two-handed"],
	range: { normal: 80, long: 320 },
	ammunitionKind: "bolt",
});
export const Shortbow = weapon("Shortbow", "simple", [6], "piercing", EWeaponMastery.VEX, 2, 25, {
	...ranged,
	properties: ["ammunition", "two-handed"],
	range: { normal: 80, long: 320 },
	ammunitionKind: "arrow",
});
export const Sling = weapon("Sling", "simple", [4], "bludgeoning", EWeaponMastery.SLOW, 0, 0.1, {
	...ranged,
	properties: ["ammunition"],
	range: { normal: 30, long: 120 },
	ammunitionKind: "bullet",
});
export const Battleaxe = weapon("Battleaxe", "martial", [8], "slashing", EWeaponMastery.TOPPLE, 4, 10, {
	...melee,
	properties: ["versatile"],
	versatileDamage: [10],
});
export const Flail = weapon("Flail", "martial", [8], "bludgeoning", EWeaponMastery.SAP, 2, 10, melee);
export const Glaive = weapon("Glaive", "martial", [10], "slashing", EWeaponMastery.GRAZE, 6, 20, {
	...melee,
	properties: ["heavy", "reach", "two-handed"],
	reach: 10,
});
export const Greataxe = weapon("Greataxe", "martial", [12], "slashing", EWeaponMastery.CLEAVE, 7, 30, {
	...melee,
	properties: ["heavy", "two-handed"],
});
export const Greatsword = weapon("Greatsword", "martial", [6, 6], "slashing", EWeaponMastery.GRAZE, 6, 50, {
	...melee,
	properties: ["heavy", "two-handed"],
});
export const Halberd = weapon("Halberd", "martial", [10], "slashing", EWeaponMastery.CLEAVE, 6, 20, {
	...melee,
	properties: ["heavy", "reach", "two-handed"],
	reach: 10,
});
export const Lance = weapon("Lance", "martial", [10], "piercing", EWeaponMastery.TOPPLE, 6, 10, {
	...melee,
	properties: ["heavy", "reach", "two-handed"],
	reach: 10,
	oneHandedWhenMounted: true,
});
export const Longsword = weapon("Longsword", "martial", [8], "slashing", EWeaponMastery.SAP, 3, 15, {
	...melee,
	properties: ["versatile"],
	versatileDamage: [10],
});
export const Maul = weapon("Maul", "martial", [6, 6], "bludgeoning", EWeaponMastery.TOPPLE, 10, 10, {
	...melee,
	properties: ["heavy", "two-handed"],
});
export const Morningstar = weapon("Morningstar", "martial", [8], "piercing", EWeaponMastery.SAP, 4, 15, melee);
export const Pike = weapon("Pike", "martial", [10], "piercing", EWeaponMastery.PUSH, 18, 5, {
	...melee,
	properties: ["heavy", "reach", "two-handed"],
	reach: 10,
});
export const Rapier = weapon("Rapier", "martial", [8], "piercing", EWeaponMastery.VEX, 2, 25, {
	...melee,
	properties: ["finesse"],
});
export const Scimitar = weapon("Scimitar", "martial", [6], "slashing", EWeaponMastery.NICK, 3, 25, {
	...melee,
	properties: ["finesse", "light"],
});
export const Shortsword = weapon("Shortsword", "martial", [6], "piercing", EWeaponMastery.VEX, 2, 10, {
	...melee,
	properties: ["finesse", "light"],
});
export const Trident = weapon("Trident", "martial", [8], "piercing", EWeaponMastery.TOPPLE, 4, 5, {
	...melee,
	properties: ["thrown", "versatile"],
	range: thrown20,
	versatileDamage: [10],
});
export const Warhammer = weapon("Warhammer", "martial", [8], "bludgeoning", EWeaponMastery.PUSH, 5, 15, {
	...melee,
	properties: ["versatile"],
	versatileDamage: [10],
});
export const WarPick = weapon("War Pick", "martial", [8], "piercing", EWeaponMastery.SAP, 2, 5, {
	...melee,
	properties: ["versatile"],
	versatileDamage: [10],
});
export const Whip = weapon("Whip", "martial", [4], "slashing", EWeaponMastery.SLOW, 3, 2, {
	...melee,
	properties: ["finesse", "reach"],
	reach: 10,
});
export const Blowgun = weapon("Blowgun", "martial", [], "piercing", EWeaponMastery.VEX, 1, 10, {
	...ranged,
	properties: ["ammunition", "loading"],
	range: { normal: 25, long: 100 },
	ammunitionKind: "needle",
	flatDamage: 1,
});
export const HandCrossbow = weapon("Hand Crossbow", "martial", [6], "piercing", EWeaponMastery.VEX, 3, 75, {
	...ranged,
	properties: ["ammunition", "light", "loading"],
	range: { normal: 30, long: 120 },
	ammunitionKind: "bolt",
});
export const HeavyCrossbow = weapon("Heavy Crossbow", "martial", [10], "piercing", EWeaponMastery.PUSH, 18, 50, {
	...ranged,
	properties: ["ammunition", "heavy", "loading", "two-handed"],
	range: { normal: 100, long: 400 },
	ammunitionKind: "bolt",
});
export const Longbow = weapon("Longbow", "martial", [8], "piercing", EWeaponMastery.SLOW, 2, 50, {
	...ranged,
	properties: ["ammunition", "heavy", "two-handed"],
	range: { normal: 150, long: 600 },
	ammunitionKind: "arrow",
});
export const Musket = weapon("Musket", "martial", [12], "piercing", EWeaponMastery.SLOW, 10, 500, {
	...ranged,
	properties: ["ammunition", "loading", "two-handed"],
	range: { normal: 40, long: 120 },
	ammunitionKind: "bullet",
});
export const Pistol = weapon("Pistol", "martial", [10], "piercing", EWeaponMastery.VEX, 3, 250, {
	...ranged,
	properties: ["ammunition", "loading"],
	range: { normal: 30, long: 90 },
	ammunitionKind: "bullet",
});

/** Order follows the published Weapons table; definitions never contain combat resources. */
export const weaponTypes2024 = Object.freeze({
	club: Club,
	dagger: Dagger,
	greatclub: Greatclub,
	handaxe: Handaxe,
	javelin: Javelin,
	"light-hammer": LightHammer,
	mace: Mace,
	quarterstaff: Quarterstaff,
	sickle: Sickle,
	spear: Spear,
	dart: Dart,
	"light-crossbow": LightCrossbow,
	shortbow: Shortbow,
	sling: Sling,
	battleaxe: Battleaxe,
	flail: Flail,
	glaive: Glaive,
	greataxe: Greataxe,
	greatsword: Greatsword,
	halberd: Halberd,
	lance: Lance,
	longsword: Longsword,
	maul: Maul,
	morningstar: Morningstar,
	pike: Pike,
	rapier: Rapier,
	scimitar: Scimitar,
	shortsword: Shortsword,
	trident: Trident,
	warhammer: Warhammer,
	"war-pick": WarPick,
	whip: Whip,
	blowgun: Blowgun,
	"hand-crossbow": HandCrossbow,
	"heavy-crossbow": HeavyCrossbow,
	longbow: Longbow,
	musket: Musket,
	pistol: Pistol,
});
export type WeaponCatalogId = keyof typeof weaponTypes2024;
export const weaponCatalog: readonly Weapon[] = Object.freeze(Object.values(weaponTypes2024));
