import type { DamageType } from "../combat/DamageTypes.ts";
import type Dice from "../dice/dice.ts";
import BaseItem from "./BaseItem.ts";
import type { TWeaponMastery } from "./Weapon/WeaponMastery.ts";

export type WeaponCategory = "melee" | "ranged";
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
};
class Weapon extends BaseItem {
	declare damageType: DamageType;
	readonly category: WeaponCategory;
	readonly properties: readonly WeaponProperty[];
	readonly reach: number;
	readonly range: { normal: number; long: number } | undefined;
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
		if (weaponMastery !== undefined) this.weaponMastery = weaponMastery;
		this.category = metadata.category;
		this.properties = Object.freeze([...(metadata.properties ?? [])]);
		this.reach = metadata.reach ?? 5;
		this.range = metadata.range === undefined ? undefined : Object.freeze({ ...metadata.range });
	}
	weaponMastery?: TWeaponMastery;
}
export default Weapon;
