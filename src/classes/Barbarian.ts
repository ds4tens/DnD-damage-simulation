import Dice from "../dice/dice.ts";
import type { TAttackModifier } from "../modifiers/Modifiers.ts";
import BaseClass from "./BaseClass.ts";

class Barbarian extends BaseClass {
	getRageDamageModifier(level: number): number {
		if (level <= 8) return 2;
		if (level <= 14) return 3;
		if (level <= 20) return 4;
		throw new Error("Problem with level");
	}

	isRage: boolean = false;

	makeRage() {
		this.isRage = true;
	}

	// Уровень 2: Безрассудная атака
	protected getRecklessRageModifier(_level: number): TAttackModifier {
		return {
			hasAdvantage: true,
			hasDamageModifier: false,
		};
	}

	protected makeBrutalStrike(level: number): number {
		if (level >= 17) return new Dice(10).rollWithNormalDistribution() + new Dice(10).rollWithNormalDistribution();
		return new Dice(10).rollWithNormalDistribution();
	}

	makeAttack(level: number, isBrutalStrikePossible: boolean = false): TAttackModifier {
		if (this.isRage && isBrutalStrikePossible) {
			// Уровень 9: Жестокий удар
			return {
				hasAdvantage: false,
				hasDamageModifier: true,
				damageModifierFunction: () => {
					return this.makeBrutalStrike(level);
				},
			};
		} else if (this.isRage) {
			// Уровень 2: Безрассудная атака
			return this.getRecklessRageModifier(level);
		}
		return {
			hasAdvantage: false,
			hasDamageModifier: false,
		};
	}

	makeAction(level: number): (() => TAttackModifier)[] {
		const posiibleActions = [this.makeAttack.bind(this, level)];
		if (level >= 5 && level < 9) {
			posiibleActions.push(this.makeAttack.bind(this, level));
		} else if (level >= 9) {
			posiibleActions.push(this.makeAttack.bind(this, level, true));
		}
		return posiibleActions;
	}

	makeBonusAction() {
		const possibleBonusActions = [];
		if (!this.isRage) possibleBonusActions.push(this.makeRage.bind(this));
		return possibleBonusActions;
	}

	makeReaction() {}
}

export default Barbarian;
