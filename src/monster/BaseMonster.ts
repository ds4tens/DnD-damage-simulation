import type { TConditionName, TConditionState } from "../modifiers/Conditions.ts";

/**
 * Базовая модель монстра
 *
 * Монстры — это боевые цели без логики классов игрока
 * У монстра есть КД (AC), хиты (HP) и состояния, чтобы персонаж
 * мог атаковать их через `AttackResolver`
 * Позже сюда можно добавить действия монстров, особенности (traits),
 * спасброски и показатель опасности (CR)
 * TODO добавить динмаческий КД и хиты от уровня монстра или игрока
 */
class BaseMonster {
	name: string;
	armorClass: number;
	hitPoints: number;
	conditions: TConditionState[];

	constructor(name: string, armorClass: number, hitPoints: number) {
		this.name = name;
		this.armorClass = armorClass;
		this.hitPoints = hitPoints;
		this.conditions = [];
	}

	addCondition(condition: TConditionState): void {
		const existingCondition = this.getCondition(condition.name);
		if (!existingCondition) {
			this.conditions.push(condition);
			return;
		}

		if (condition.name === "exhaustion") {
			existingCondition.level = (existingCondition.level ?? 1) + (condition.level ?? 1);
			return;
		}

		Object.assign(existingCondition, condition);
	}

	removeCondition(conditionName: TConditionName): void {
		this.conditions = this.conditions.filter((condition) => condition.name !== conditionName);
	}

	hasCondition(conditionName: TConditionName): boolean {
		return this.conditions.some((condition) => condition.name === conditionName);
	}

	getCondition(conditionName: TConditionName): TConditionState | undefined {
		return this.conditions.find((condition) => condition.name === conditionName);
	}
}

export default BaseMonster;
