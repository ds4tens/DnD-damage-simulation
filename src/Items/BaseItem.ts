import Dice from "../dice/dice.ts"

class BaseItem {

    name: string
    description: string
    type: string
    rarity: string
    price: number
    weight: number
    size: string
    damage: Dice[]
    damageType: string

    constructor(name: string, description: string, type: string, rarirty: string, price: number, weight: number, size: string, damage: Dice[], damgeType: string) {
        this.name = name;
        this.description = description;
        this.type = type;
        this.rarity = rarirty;
        this.price = price;
        this.weight = weight;
        this.size = size;
        this.damage = damage;
        this.damageType = damgeType;
    }
}

export default BaseItem;