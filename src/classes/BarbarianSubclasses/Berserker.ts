import type { TDamageRollContext } from "../../combat/CombatTypes.ts";
import Dice from "../../dice/dice.ts";
import type { TCombatModifier } from "../../modifiers/Modifiers.ts";
import Barbarian from "../Barbarian.ts";

/**
 * Path of the Berserker skeleton
 *
 * TODO: Need reaction; Level 10: Retaliation
 */
class Berserker extends Barbarian {
	getFrenzyDamageBonus(ctx: TDamageRollContext): number {
		if (!this.isRaging || !ctx.isFirstHitOfTurn || ctx.attacker.level < 3 || !this.isUsingRecklessAttack(ctx)) return 0;

		const rageDamageBonus = this.getRageDamageBonus(ctx.attacker.level);
		let damageBonus = 0;
		for (let diceIndex = 0; diceIndex < rageDamageBonus; diceIndex++) {
			damageBonus += new Dice(6).rollWithNormalDistribution();
		}

		return damageBonus;
	}

	override getDamageRollModifiers(ctx: TDamageRollContext): TCombatModifier[] {
		return [
			...super.getDamageRollModifiers(ctx),
			{
				source: "barbarian.berserker.frenzy",
				damageRoll: {
					bonusFns: [(damageCtx) => this.getFrenzyDamageBonus(damageCtx)],
				},
			},
		];
	}
}

export default Berserker;
