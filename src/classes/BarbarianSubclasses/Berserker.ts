import Dice from "../../dice/dice.ts";
import type { TAttackModifier } from "../../modifiers/Modifiers.ts";
import Barbarian from "../Barbarian.ts";

class Berserker extends Barbarian {
	protected getRecklessRageModifier(level: number): TAttackModifier {
		return {
			hasAdvantage: true,
			hasDamageModifier: true,
			damageModifierFunctions: [
				(_ctx) => {
					const rageBonus = this.getRageDamageModifier(level);
					const frenzyDice = Array.from({ length: rageBonus }, () => new Dice(6).rollWithNormalDistribution());
					return frenzyDice.reduce((acc: number, n: number) => acc + n, 0);
				},
			],
		};
	}

	protected makeBrutalStrike(level: number): number {
		if (level >= 17) return new Dice(10).rollWithNormalDistribution() + new Dice(10).rollWithNormalDistribution();
		return new Dice(10).rollWithNormalDistribution();
	}
}

export default Berserker;
