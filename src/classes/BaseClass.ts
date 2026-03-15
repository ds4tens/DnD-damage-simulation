import Weapon from "../Items/Weapon.ts";
import type { TAttackModifier } from "../modifiers/Modifiers.ts";

class BaseClass {

    _weaponProficiency: Weapon[]

    constructor(weaponProficiency: Weapon[]) {
        this._weaponProficiency = weaponProficiency
    }

    makeAction(_level: number): (() => TAttackModifier)[] {
        return []
    }

    makeBonusAction(): (() => void)[] {
        return []
    }
    
}

export default BaseClass;