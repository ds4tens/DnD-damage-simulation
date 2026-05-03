import type { TDamageRollContext } from "../../combat/CombatTypes.ts";
import Dice from "../../dice/dice.ts";
import type { TCombatModifier } from "../../modifiers/Modifiers.ts";
import Barbarian from "../Barbarian.ts";

/**
 * Path of the Zealot skeleton
 */
class Zealot extends Barbarian {
	/**
	 *
	 * You can channel divine power into your strikes.
	 * On each of your turns while your Rage is active, the first creature you hit with a weapon or an Unarmed Strike takes extra damage equal to 1d6 plus half your Barbarian level (round down).
	 * The extra damage is Necrotic or Radiant; you choose the type each time you deal the damage.
	 */
	getDivineFuryDamageBonus(ctx: TDamageRollContext): number {
		if (!ctx.isFirstHitOfTurn || !this.isRaging || ctx.attacker.level < 3) return 0;
		return new Dice(6).rollWithNormalDistribution() + Math.floor(ctx.attacker.level / 2);
	}

	/**
	 * Return damage roll modifiers from Zealot features
	 */
	override getDamageRollModifiers(ctx: TDamageRollContext): TCombatModifier[] {
		return [
			...super.getDamageRollModifiers(ctx),
			{
				source: "barbarian.zealot.divine-fury",
				damageRoll: {
					bonusFns: [(damageCtx) => this.getDivineFuryDamageBonus(damageCtx)],
				},
			},
		];
	}

	// Больше у подкласса ничего и нет
}

export default Zealot;
