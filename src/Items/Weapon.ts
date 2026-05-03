import type Dice from "../dice/dice.ts";
import BaseItem from "./BaseItem.ts";
import type { TWeaponMastery } from "./Weapon/WeaponMastery.ts";

class Weapon extends BaseItem {
	weaponMastery?: TWeaponMastery;

	constructor(
		name: string,
		description: string,
		type: string,
		rarity: string,
		price: number,
		weight: number,
		size: string,
		damage: Dice[],
		damageType: string,
		weaponMastery?: TWeaponMastery,
	) {
		super(name, description, type, rarity, price, weight, size, damage, damageType);
		if (weaponMastery !== undefined) {
			this.weaponMastery = weaponMastery;
		}
	}
}

export default Weapon;
