import BaseClass from "../classes/BaseClass.ts"
import type Weapon from "../Items/Weapon.ts"
import Dice from "../dice/dice.ts"

type Spell = {
    level: number
    name: string
}

type StatsTypes = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma'

type StatBlock = {
    [key in StatsTypes]: number
}

const defaultStatBlock: StatBlock = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
}
class BaseCharacter {

    _level: number
    _characterClass: BaseClass
    _weapon: Weapon
    _weaponPrimaryStat: StatsTypes
    _statBlock: StatBlock

    constructor(level: number, characterClass: BaseClass, weapon: Weapon, weaponPrimaryStat: StatsTypes = 'strength', statBlock: StatBlock = defaultStatBlock) {
        this._level = level
        this._characterClass = characterClass
        this._weapon = weapon;
        this._weaponPrimaryStat = weaponPrimaryStat;
        this._statBlock = statBlock;
    }

    getBonusProficiency(): number {
        if (this._level <= 4) return 2;
        if (this._level <= 8) return 3;
        if (this._level <= 12) return 4;
        if (this._level <= 16) return 5;
        if (this._level <= 20) return 6;
        throw new Error('Problem with level')
    }

    calculateStatModifier(stat: StatsTypes): number {
        return Math.floor((this._statBlock[stat] - 10) / 2)
    }

    calculateHitBonus(): number {
        let hitBonus = 0;
        const hitStatModifier = this.calculateStatModifier(this._weaponPrimaryStat)
        hitBonus += hitStatModifier
        if (this._characterClass._weaponProficiency.find(weapon => weapon.name === this._weapon.name)) {
            hitBonus += this.getBonusProficiency();
        }
        return hitBonus;
    }
    
    calculateDamageBonus(): number {
        let damageBonus = 0;
        const damageStatModifier = this.calculateStatModifier(this._weaponPrimaryStat)
        damageBonus += damageStatModifier
        return damageBonus;
    }

    attack(): {
        hitChance: number,
        damage: number,
        damageType: string
    } {
        const hitBonus = this.calculateHitBonus();
        const damageBonus = this.calculateDamageBonus();

        const hitChance = new Dice(20).rollWithNormalDistribution() + hitBonus
        // TODO: make crit chance
        // TODO: make crit damage
        // TODO: make dynamic AC based on level or parametr
        if (hitChance <= 15) return {
            hitChance: hitChance,
            damage: 0,
            damageType: ''
        }

        
        const damage = this._weapon.damage.reduce((acc, dice) => acc + dice.rollWithNormalDistribution(), 0) + damageBonus
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