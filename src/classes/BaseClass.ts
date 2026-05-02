import type { TAttackContext, TDamageRollContext, TPostHitContext, TTurnContext } from "../combat/CombatTypes.ts";
import type Weapon from "../Items/Weapon.ts";
import type { TCombatModifier } from "../modifiers/Modifiers.ts";

/**
 * Base D&D class model.
 *
 * A class should describe what it contributes to combat: proficiencies, number
 * of attacks, and modifiers from class features. It should not roll dice or
 * decide whether attacks hit; resolvers own that flow.
 */
class BaseClass {
	weaponProficiencies: Weapon[];

	constructor(weaponProficiencies: Weapon[]) {
		this.weaponProficiencies = weaponProficiencies;
	}

	/**
	 * Check whether this class is proficient with a weapon.
	 */
	isProficientWithWeapon(weapon: Weapon): boolean {
		return this.weaponProficiencies.some((proficientWeapon) => proficientWeapon.name === weapon.name);
	}

	/**
	 * Return how many weapon attacks this class makes during its Attack action.
	 *
	 * Subclasses or specific classes can override this for Extra Attack and other
	 * features. The default is one attack.
	 */
	getAttackCount(_level: number): number {
		return 1;
	}

	/**
	 * Return class modifiers that apply before the actor starts resolving attacks.
	 */
	getTurnModifiers(_ctx: TTurnContext): TCombatModifier[] {
		return [];
	}

	/**
	 * Return class modifiers that apply to a specific attack roll.
	 */
	getAttackModifiers(_ctx: TAttackContext): TCombatModifier[] {
		return [];
	}

	/**
	 * Return class modifiers that apply after a successful hit.
	 */
	getPostHitModifiers(_ctx: TPostHitContext): TCombatModifier[] {
		return [];
	}

	/**
	 * Return class modifiers that apply after an attack hits and damage is rolled.
	 */
	getDamageRollModifiers(_ctx: TDamageRollContext): TCombatModifier[] {
		return [];
	}
}

export default BaseClass;
