import { normalDistributionInRange } from "../lib/normalDistrub.ts";

class Dice {
	_minDiceValue = 1;
	_maxValue: number;

	constructor(maxValue: number) {
		this._maxValue = maxValue;
	}

	/**
	 * Бросок кубика с нормальным распределением
	 * @param useNormalDistribution - использовать ли нормальное распределение (по умолчанию true)
	 * @returns результат броска
	 */
	rollWithNormalDistribution(useNormalDistribution: boolean = true): number {
		if (useNormalDistribution) {
			return normalDistributionInRange(this._minDiceValue, this._maxValue);
		} else {
			// Обычный равномерный бросок
			return Math.floor(Math.random() * (this._maxValue - this._minDiceValue + 1)) + this._minDiceValue;
		}
	}
}

export default Dice;
