import Dice from "../../dice/dice.ts";
import type { TAttackContext, TAttackModifier } from "../../modifiers/Modifiers.ts";
import Barbarian from "../Barbarian.ts";

class Zealot extends Barbarian {
	/**
	 * Level 3: Divine Fury
	 * On each of your turns while your Rage is active, the first creature you hit
	 * takes extra damage equal to 1d6 plus half your Barbarian level (round down).
	 * The extra damage is Necrotic or Radiant (choice each time).
	 * TODO: добавить Necrotic или Radiant
	 */
	protected getDivineFuryDamage(level: number): number {
		return new Dice(6).rollWithNormalDistribution() + Math.floor(level / 2);
	}

	override makeAttack(level: number, isBrutalStrikePossible: boolean = false): TAttackModifier {
		const base = super.makeAttack(level, isBrutalStrikePossible);
		if (level < 3 || !this.isRage) return base;

		const divineFuryFn = (ctx: TAttackContext) => (ctx.isFirstHitOfTurn ? this.getDivineFuryDamage(level) : 0);

		if (base.hasDamageModifier && base.damageModifierFunctions) {
			return {
				...base,
				damageModifierFunctions: [...base.damageModifierFunctions, divineFuryFn],
			};
		}
		return {
			...base,
			hasDamageModifier: true,
			damageModifierFunctions: [divineFuryFn],
		};
	}
}

export default Zealot;
