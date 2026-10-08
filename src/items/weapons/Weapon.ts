import type { DamageType } from "../../combat/damage/DamageTypes.ts";
import type Dice from "../../dice/dice.ts";
import BaseItem from "../BaseItem.ts";
import type { TWeaponMastery } from "./WeaponMastery.ts";

export type WeaponCategory = "melee" | "ranged";
export type WeaponProficiencyCategory = "simple" | "martial";
export type AmmunitionKind = "arrow" | "bolt" | "bullet" | "needle";
export type WeaponProperty =
	| "heavy"
	| "reach"
	| "two-handed"
	| "versatile"
	| "light"
	| "finesse"
	| "thrown"
	| "ammunition"
	| "loading";
export type WeaponCombatMetadata = {
	category: WeaponCategory;
	properties?: readonly WeaponProperty[];
	reach?: number;
	range?: { normal: number; long: number };
	/** Dice sizes for the two-handed melee damage profile. */
	versatileDamage?: readonly number[];
	/** Weapons such as Blowgun deal a constant weapon damage instead of dice. */
	flatDamage?: number;
	ammunitionKind?: AmmunitionKind;
	proficiencyCategory?: WeaponProficiencyCategory;
	/** Lance's Two-Handed exception does not imply support for mounted combat. */
	oneHandedWhenMounted?: boolean;
};
class Weapon extends BaseItem {
	declare damageType: DamageType;
	readonly id: string;
	readonly category: WeaponCategory;
	readonly proficiencyCategory: WeaponProficiencyCategory;
	readonly properties: readonly WeaponProperty[];
	readonly reach: number;
	readonly range: { normal: number; long: number } | undefined;
	readonly versatileDamage: readonly number[] | undefined;
	readonly flatDamage: number;
	readonly ammunitionKind: AmmunitionKind | undefined;
	readonly oneHandedWhenMounted: boolean;
	constructor(
		name: string,
		description: string,
		type: string,
		rarity: string,
		price: number,
		weight: number,
		size: string,
		damage: Dice[],
		damageType: DamageType,
		weaponMastery?: TWeaponMastery,
		metadata: WeaponCombatMetadata = { category: "melee" },
	) {
		super(name, description, type, rarity, price, weight, size, damage, damageType);
		this.id = name
			.toLowerCase()
			.replaceAll(/[^a-z0-9]+/g, "-")
			.replaceAll(/^-|-$/g, "");
		if (weaponMastery !== undefined) this.weaponMastery = weaponMastery;
		this.category = metadata.category;
		this.proficiencyCategory = metadata.proficiencyCategory ?? (type === "martial" ? "martial" : "simple");
		this.properties = Object.freeze([...(metadata.properties ?? [])]);
		this.reach = metadata.reach ?? 5;
		this.range = metadata.range === undefined ? undefined : Object.freeze({ ...metadata.range });
		this.versatileDamage =
			metadata.versatileDamage === undefined ? undefined : Object.freeze([...metadata.versatileDamage]);
		this.flatDamage = metadata.flatDamage ?? 0;
		this.ammunitionKind = metadata.ammunitionKind;
		this.oneHandedWhenMounted = metadata.oneHandedWhenMounted ?? false;
	}
	weaponMastery?: TWeaponMastery;
}
export default Weapon;
