import BaseClass from "../classes/BaseClass.ts"
import type Weapon from "../Items/Weapon.ts"
import Dice from "../dice/dice.ts"

type Spell = {
    level: number
    name: string
}

class BaseCharacter {

    _level: number
    _characterClass: BaseClass
    _weapon: Weapon

    constructor(level: number, characterClass: BaseClass, weapon: Weapon) {
        this._level = level
        this._characterClass = characterClass
        this._weapon = weapon;
    }

    attack(): {
        hitChance: number,
        damage: number,
        damageType: string
    } {
        let hitBonus = 0;
        if (this._characterClass._weaponProficiency.find(weapon => weapon.name === this._weapon.name)) hitBonus = 2;

        const hitChance = new Dice(20).rollWithNormalDistribution() + hitBonus
        const damage = this._weapon.damage.reduce((acc, dice) => acc + dice.rollWithNormalDistribution(), 0)
        const damageType = this._weapon.damageType

        // console.log('hitBonus : ', hitBonus)
        // console.log("make attack with ", this._weapon.name)
        // console.log('hit chance ', hitChance)
        // console.log("damage ", damage)

        return {
            hitChance,
            damage,
            damageType
        }
    }

    castSpell(spell: Spell ) {
        console.log("cast spell ", spell.name)
    }
}

export default BaseCharacter