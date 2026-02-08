import Dice from "./dice/dice.ts";
import Weapon from "./Items/Weapon.ts";
import BaseCharacter from "./character/BaseCharacter.ts";
import Barbarian from "./classes/Barbarian.ts";

const d12 = new Dice(12)
const d6 = new Dice(6)

const dualSword = new Weapon(
    "dualSword", "", "dual", "rare", 100, 300, "big", [d12], "hex"
)

const heavySword = new Weapon(
    "heavySword", "", "dual", "rare", 100, 300, "big", [d6, d6], "hex"
)

const barb = new Barbarian(1, [dualSword, heavySword])

const Jhon = new BaseCharacter(1, barb, dualSword)
const Emual = new BaseCharacter(1, barb, heavySword)

const jhonDamage = []
const emualDamage = []

for (let i = 0; i < 10000; i++) {
    jhonDamage.push(Jhon.attack().damage)
    emualDamage.push(Emual.attack().damage)
}

console.log('Jhon avg damage ', jhonDamage.reduce((acc,damage) => acc + damage, 0)/10000)
console.log('Emual avg damage', emualDamage.reduce((acc, damage) => acc + damage, 0)/10000)