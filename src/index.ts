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

const Jhon = new BaseCharacter(1, barb, heavySword, 'strength', {
    strength: 18,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
})
const Emual = new BaseCharacter(20, barb, heavySword, 'dexterity', {
    strength: 10,
    dexterity: 18,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
})

const jhonDamage = []
const emualDamage = []

for (let i = 0; i < 10000; i++) {
    jhonDamage.push(Jhon.attack().damage)
    emualDamage.push(Emual.attack().damage)
}

console.log('Jhon avg damage ', jhonDamage.reduce((acc,damage) => acc + damage, 0)/10000)
console.log('Emual avg damage', emualDamage.reduce((acc, damage) => acc + damage, 0)/10000)