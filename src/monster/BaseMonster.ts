import { defaultStatBlock, type TStatBlock, type TStatsType } from "../character/BaseCharacter.ts";
import { abilityNames, type CombatantOptions, combatantData } from "../character/CombatantData.ts";
import type { DamageDefenses } from "../combat/DamageTypes.ts";
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
	speed: number;
	stats: TStatBlock;
	readonly proficiencyBonus: number;
	readonly savingThrowProficiencies: readonly TStatsType[];
	readonly savingThrowBonuses: Partial<Record<TStatsType, number>>;
	readonly defenses: DamageDefenses;
	readonly medicineProficient: boolean;

	constructor(
		name: string,
		armorClass: number,
		hitPoints: number,
		speed: number = 30,
		options: CombatantOptions & { stats?: TStatBlock; proficiencyBonus?: number } = {},
	) {
		const data = combatantData(options);
		this.stats = { ...(options.stats ?? defaultStatBlock) };
		if (
			abilityNames.some(
				(ability) => !Number.isInteger(this.stats[ability]) || this.stats[ability] < 1 || this.stats[ability] > 30,
			)
		)
			throw new Error("Invalid monster ability scores");
		this.proficiencyBonus = options.proficiencyBonus ?? 2;
		if (!Number.isInteger(this.proficiencyBonus) || this.proficiencyBonus < 0)
			throw new Error("Invalid proficiency bonus");
		this.savingThrowProficiencies = data.savingThrowProficiencies;
		this.savingThrowBonuses = data.savingThrowBonuses;
		this.defenses = data.defenses;
		this.medicineProficient = data.medicineProficient;
		this.name = name;
		this.armorClass = armorClass;
		this.hitPoints = hitPoints;
		this.conditions = [];
		this.speed = speed;
	}

	getProficiencyBonus(): number {
		return this.proficiencyBonus;
	}
	getStatModifier(ability: TStatsType): number {
		return Math.floor((this.stats[ability] - 10) / 2);
	}
	getSavingThrowBonus(ability: TStatsType): number {
		return (
			this.savingThrowBonuses[ability] ??
			this.getStatModifier(ability) + (this.savingThrowProficiencies.includes(ability) ? this.getProficiencyBonus() : 0)
		);
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
