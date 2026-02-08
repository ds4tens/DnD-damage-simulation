import BaseClass from "./BaseClass.ts";
import Weapon from "../Items/Weapon.ts";

class Barbarian extends BaseClass {

    constructor(level: number, weaponProficiency: Weapon[]) {
        super(level, weaponProficiency)
    }
}


export default Barbarian;