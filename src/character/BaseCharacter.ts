import type BaseClass from "../classes/BaseClass.ts";
import type { DamageDefenses } from "../combat/DamageTypes.ts";
import { resolveFeatSelections } from "../feats/FeatSelection.ts";
import type { FeatSelection, ValidatedFeatSelection } from "../feats/FeatTypes.ts";
import type Weapon from "../Items/Weapon.ts";
import type { TConditionName, TConditionState } from "../modifiers/Conditions.ts";
import { type CombatantOptions, combatantData } from "./CombatantData.ts";

export type TStatsType = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";

export type TStatBlock = {
	[key in TStatsType]: number;
};

export const defaultStatBlock: TStatBlock = {
	strength: 10,
	dexterity: 10,
	constitution: 10,
	intelligence: 10,
	wisdom: 10,
	charisma: 10,
};

/**
 * Базовая модель персонажа
 *
 * Этот класс должен оставаться в основном пассивным: хранить данные персонажа
 * и отдавать простые вычисляемые значения вроде бонуса мастерства, бонуса
 * атаки и бонуса урона. Ход боя живет в AttackResolver и DamageResolver,
 * а не здесь
 */
class BaseCharacter {
	level: number;
	characterClass: BaseClass;
	weapon: Weapon;
	weaponPrimaryStat: TStatsType;
	stats: TStatBlock;
	armorClass: number;
	hitPoints: number;
	conditions: TConditionState[];
	speed: number = 30;
	readonly feats: readonly ValidatedFeatSelection[];
	readonly savingThrowProficiencies: readonly TStatsType[];
	readonly savingThrowBonuses: Partial<Record<TStatsType, number>>;
	readonly defenses: DamageDefenses;
	readonly medicineProficient: boolean;

	constructor(
		level: number,
		characterClass: BaseClass,
		weapon: Weapon,
		weaponPrimaryStat: TStatsType = "strength",
		stats: TStatBlock = defaultStatBlock,
		armorClass: number = 16,
		hitPoints: number = 1,
		feats: readonly FeatSelection[] = [],
		combatOptions: CombatantOptions = {},
	) {
		const data = combatantData(combatOptions, characterClass.savingThrowProficiencies);
		this.savingThrowProficiencies = data.savingThrowProficiencies;
		this.savingThrowBonuses = data.savingThrowBonuses;
		this.defenses = data.defenses;
		this.medicineProficient = data.medicineProficient;
		this.level = level;
		this.characterClass = characterClass;
		this.weapon = weapon;
		this.weaponPrimaryStat = weaponPrimaryStat;
		const resolved = resolveFeatSelections({ level, stats, feats });
		this.stats = resolved.stats;
		this.armorClass = armorClass;
		this.hitPoints = hitPoints;
		this.conditions = [];
		this.feats = Object.freeze(
			resolved.feats.map((feat) =>
				Object.freeze({
					...feat,
					...(feat.abilityScoreImprovement === undefined
						? {}
						: {
								abilityScoreImprovement: Object.freeze(
									feat.abilityScoreImprovement.map((choice) => Object.freeze(choice)),
								),
							}),
				}),
			),
		);
	}

	getProficiencyBonus(): number {
		if (this.level <= 4) return 2;
		if (this.level <= 8) return 3;
		if (this.level <= 12) return 4;
		if (this.level <= 16) return 5;
		if (this.level <= 20) return 6;
		throw new Error(`Unsupported character level: ${this.level}`);
	}

	getSavingThrowBonus(ability: TStatsType): number {
		return (
			this.savingThrowBonuses[ability] ??
			this.getStatModifier(ability) + (this.savingThrowProficiencies.includes(ability) ? this.getProficiencyBonus() : 0)
		);
	}

	getStatModifier(stat: TStatsType): number {
		return Math.floor((this.stats[stat] - 10) / 2);
	}

	/**
	 * Возвращает постоянный бонус атаки (попаданние) для оружия
	 *
	 * Сюда входит модификатор характеристики и бонус мастерства, если класс
	 * владеет этим оружием
	 * WARN: Временные эффекты должны приходить через боевые
	 * модификаторы
	 */
	getAttackBonus(): number {
		const proficiencyBonus = this.characterClass.isProficientWithWeapon(this.weapon) ? this.getProficiencyBonus() : 0;
		return this.getStatModifier(this.weaponPrimaryStat) + proficiencyBonus;
	}

	/**
	 * Возвращает постоянный бонус урона для оружия
	 *
	 * WARN: Временный бонусный урон добавляется в DamageResolver через боевые
	 * модификаторы
	 */
	getDamageBonus(): number {
		return this.getStatModifier(this.weaponPrimaryStat);
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

export default BaseCharacter;
