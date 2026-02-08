import Weapon from "../Items/Weapon.ts";

class BaseClass {

    _level: number;
    _weaponProficiency: Weapon[]

    constructor(level: number, weaponProficiency: Weapon[]) {
        this._level = level;
        this._weaponProficiency = weaponProficiency
    }
}

export default BaseClass;