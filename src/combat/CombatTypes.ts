import type BaseCharacter from "../character/BaseCharacter.ts";
import type { TConditionName, TConditionState } from "../modifiers/Conditions.ts";

/**
 * Минимальная форма любого существа, которое может быть целью в бою
 *
 * Персонажи и монстры должны соответствовать этому контракту. AttackResolver'у
 * нужны отсюда только боевые данные о цели: КД, ХП и кондишены
 */
export type TCombatTarget = {
	armorClass: number;
	hitPoints: number;
	conditions: TConditionState[];
	addCondition(condition: TConditionState): void;
	removeCondition(conditionName: TConditionName): void;
	hasCondition(conditionName: TConditionName): boolean;
	getCondition(conditionName: TConditionName): TConditionState | undefined;
};

/**
 * Контекст для эффектов, которые проверяются до того, как существо начинает
 * действовать в свой ход
 *
 * Используется для правил вроде Incapacitated, Stunned и других эффектов,
 * которые могут запретить действия, бонусные действия или реакции еще до
 * выбора атаки. На данном этапе такое невозможно т.к. нет ответных действий монстра
 */
export type TTurnContext = {
	actor: BaseCharacter;
};

/**
 * Общий контекст для эффектов, которые меняют атаку до обработки броска d20
 *
 * Это основной контекст для состояний и классовых умений, влияющих на бросок
 * атаки: Advantage, Disadvantage, штрафы Exhaustion, Reckless Attack, укрытие
 * и так далее
 */
export type TAttackContext = {
	attacker: BaseCharacter;
	target: TCombatTarget;
	attackIndexInTurn: number;
	hasHitOccurredThisTurn: boolean;
	distance?: number;
};

/**
 * Результат одного броска атаки до расчета урона
 *
 * Использовать только как данныке! Результат должен описывать, что произошло,
 * а не решать, что будет дальше
 */
export type THitResult = {
	d20Roll: number;
	totalAttackRoll: number;
	isHit: boolean;
	isCrit: boolean; // FIXME: Сейчас возможен исход, что значение крит не будет соответствовать isHit
};

/**
 * Контекст для эффектов, которые добавляют или меняют урон на этапе броска урона
 *
 * Используется для классовых умений вроде Divine Fury, Brutal Strike,
 * Sneak Attack, а также для будущих правил оружия или заклинаний, которые
 * добавляют урон после попадания атаки
 */
export type TDamageRollContext = {
	attacker: BaseCharacter;
	target: TCombatTarget;
	attackIndexInTurn: number;
	hasHitOccurredThisTurn: boolean;
	isFirstHitOfTurn: boolean;
	isCrit: boolean;
	damageType: string;
	baseDamage: number;
	distance?: number;
};

/**
 * Контекст для эффектов, которые применяются после успешного попадания атаки
 *
 * Используется для условий Prone из Ram (WildHEart Barbarian)
 */
export type TPostHitContext = {
	attacker: BaseCharacter;
	target: TCombatTarget;
	attackIndexInTurn: number;
	hasHitOccurredThisTurn: boolean;
	hit: THitResult;
	distance?: number;
};

/**
 * Контекст для эффектов, которые меняют урон после броска
 *
 * Используется для сопротивления, уязвимости, иммунитета, временных HP и других
 * модификаторов, влияющих на то, сколько урона цель реально получает
 */
export type TApplyDamageContext = {
	attacker: BaseCharacter;
	target: TCombatTarget;
	damage: number;
	damageType: string;
	isCrit: boolean;
};

/**
 * Результат расчета урона для одного успешного попадания
 *
 * `rolledDamage` — урон до применения правил цели. `appliedDamage` — урон,
 * который цель фактически получит после сопротивлений, уязвимостей и прочих
 * эффектов
 */
export type TDamageResult = {
	rolledDamage: number;
	appliedDamage: number;
	damageType: string;
};

/**
 * Результат одной попытки атаки внутри хода
 *
 * У промах атак нет результата урона. Попавшие атаки должны включать урон, который считается в DamageResolver
 */
export type TAttackResult = {
	attackIndexInTurn: number;
	hit: THitResult;
	damage?: TDamageResult;
};

/**
 * Результат обработки всех атак существа за его ход
 *
 * Эта форма намеренно подробная: симуляции DPR могут брать `totalDamage`
 * Для отладки смотреть `attacks`
 */
export type TAttackTurnResult = {
	totalDamage: number;
	attacks: TAttackResult[];
};
