import type BaseClass from "../classes/BaseClass.ts";
import Dice from "../dice/dice.ts";
import type Weapon from "../Items/Weapon.ts";
import type { TAttackModifier } from "../modifiers/Modifiers.ts";

type Spell = {
	level: number;
	name: string;
};

type StatsTypes = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";

type StatBlock = {
	[key in StatsTypes]: number;
};

const defaultStatBlock: StatBlock = {
	strength: 10,
	dexterity: 10,
	constitution: 10,
	intelligence: 10,
	wisdom: 10,
	charisma: 10,
};
class BaseCharacter {
	_level: number;
	_characterClass: BaseClass;
	_weapon: Weapon;
	_weaponPrimaryStat: StatsTypes;
	_statBlock: StatBlock;
	_critThershold: number;

	constructor(
		level: number,
		characterClass: BaseClass,
		weapon: Weapon,
		weaponPrimaryStat: StatsTypes = "strength",
		statBlock: StatBlock = defaultStatBlock,
		critThershold: number = 20,
	) {
		this._level = level;
		this._characterClass = characterClass;
		this._weapon = weapon;
		this._weaponPrimaryStat = weaponPrimaryStat;
		this._statBlock = statBlock;
		this._critThershold = critThershold;
	}

	getBonusProficiency(): number {
		if (this._level <= 4) return 2;
		if (this._level <= 8) return 3;
		if (this._level <= 12) return 4;
		if (this._level <= 16) return 5;
		if (this._level <= 20) return 6;
		throw new Error("Problem with level");
	}

	calculateStatModifier(stat: StatsTypes): number {
		return Math.floor((this._statBlock[stat] - 10) / 2);
	}

	calculateHitBonus(): number {
		let hitBonus = 0;
		const hitStatModifier = this.calculateStatModifier(this._weaponPrimaryStat);
		hitBonus += hitStatModifier;
		if (this._characterClass._weaponProficiency.find((weapon) => weapon.name === this._weapon.name)) {
			hitBonus += this.getBonusProficiency();
		}
		return hitBonus;
	}

	calculateDamageBonus(): number {
		let damageBonus = 0;
		const damageStatModifier = this.calculateStatModifier(this._weaponPrimaryStat);
		damageBonus += damageStatModifier;
		return damageBonus;
	}

	_makeHitCheck(actionModifier: TAttackModifier): { isCrit: boolean; isHit: boolean; hitChance: number } {
		const hitBonusWithStatModifier = this.calculateHitBonus();
		const hitBonusWithActionModifier = actionModifier.hasHitModifier ? actionModifier.hitModifierFunction() : 0;

		const rawHitChance = actionModifier.hasAdvantage
			? Math.max(new Dice(20).rollWithNormalDistribution(), new Dice(20).rollWithNormalDistribution())
			: actionModifier.hasDisadvantage
				? Math.min(new Dice(20).rollWithNormalDistribution(), new Dice(20).rollWithNormalDistribution())
				: new Dice(20).rollWithNormalDistribution();

		const hitChanceWithBonus = rawHitChance + hitBonusWithStatModifier + hitBonusWithActionModifier;

		if (hitChanceWithBonus >= this._critThershold) {
			return {
				isCrit: true,
				isHit: true,
				hitChance: hitChanceWithBonus,
			};
		}
		return {
			isCrit: false,
			isHit: hitChanceWithBonus >= 16, // TODO make dynamic armor class based on level or parametr
			hitChance: hitChanceWithBonus,
		};
	}

	_makeDamageCalculation(actionModifier: TAttackModifier, isCrit: boolean): number {
		const damageBonusWithActionModifier = actionModifier.hasDamageModifier
			? actionModifier.damageModifierFunction()
			: 0;
		const damageBonusWithStatModifier = this.calculateDamageBonus();
		if (isCrit) {
			const critDamage = this._weapon.damage.reduce(
				(acc, dice) => acc + dice.rollWithNormalDistribution() + dice.rollWithNormalDistribution(),
				0,
			);
			return critDamage + damageBonusWithStatModifier + damageBonusWithActionModifier;
		}
		return (
			this._weapon.damage.reduce((acc, dice) => acc + dice.rollWithNormalDistribution(), 0) +
			damageBonusWithStatModifier +
			damageBonusWithActionModifier
		);
	}

	makePossibleActions(): number {
		const possibleActions = this._characterClass.makeAction(this._level);
		return possibleActions.reduce((acc, action) => {
			const actionModifier = action();
			const resultHitCheck = this._makeHitCheck(actionModifier);
			if (resultHitCheck.isCrit) {
				const damage = this._makeDamageCalculation(actionModifier, true);
				return acc + damage;
			}
			if (resultHitCheck.isHit) {
				const damage = this._makeDamageCalculation(actionModifier, false);
				return acc + damage;
			}
			return acc + 0;
		}, 0);
	}

	// makePossibleBonusActions(): number {
	//     const possibleBonusActions = this._characterClass.makeBonusAction()
	//     return 1
	// }
	// {
	//     isCrit?: boolean,
	//     hitChance: number,
	//     damage: number,
	//     damageType: string
	// }
	attack(): number {
		this._characterClass.makeBonusAction().forEach((action) => {
			action();
		});
		return this.makePossibleActions();

		// const hitBonus = this.calculateHitBonus();
		// const damageBonus = this.calculateDamageBonus();

		// const rawHitChance = new Dice(20).rollWithNormalDistribution();
		// const hitChanceWithBonus = rawHitChance + hitBonus;
		// // TODO: make crit chance
		// // TODO: make crit damage
		// // TODO: make dynamic AC based on level or parametr

		// if (hitChanceWithBonus >= this._critThershold) {
		//     return {
		//         isCrit: true,
		//         // damage: this,
		//         hitChance: hitChanceWithBonus,
		//     }
		// }

		// if (hitChance <= 15) return {
		//     hitChance: hitChance,
		//     damage: 0,
		//     damageType: ''
		// }

		// const damage = this._weapon.damage.reduce((acc, dice) => acc + dice.rollWithNormalDistribution(), 0) + damageBonus
		// const damageType = this._weapon.damageType

		// console.log('hitBonus : ', hitBonus)
		// console.log("make attack with ", this._weapon.name)
		// console.log('hit chance ', hitChance)
		// console.log("damage ", damage)

		// return {
		//     hitChance,
		//     damage,
		//     damageType
		// }
	}

	castSpell(spell: Spell) {
		console.log("cast spell ", spell.name);
	}
}

export default BaseCharacter;
