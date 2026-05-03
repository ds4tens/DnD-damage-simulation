import type BaseCharacter from "../character/BaseCharacter.ts";
import type { TCombatModifier } from "../modifiers/Modifiers.ts";
import type { TCombatTarget, TDamageResult, TDamageRollContext } from "./CombatTypes.ts";

/**
 * Бросок урона оружия для одного успешного попадания
 *
 * Сейчас критические попадания удваивают только кости оружия. Постоянные
 * бонусы и бонусы от модификаторов добавляются один раз
 */
export function rollWeaponDamage(attacker: BaseCharacter, isCrit: boolean): number {
	return attacker.weapon.damage.reduce((totalDamage, dice) => {
		const normalRoll = dice.rollWithNormalDistribution();
		const critRoll = isCrit ? dice.rollWithNormalDistribution() : 0;
		return totalDamage + normalRoll + critRoll;
	}, 0);
}

/**
 * Подсчитывает выброшенный урон до правил, которые применяются со стороны цели
 *
 * Здесь должны собираться бонусы урона от класса, подкласса, оружия и заклинаний (скорее всего заклинания сломают это)
 */
export function resolveRolledDamage(ctx: TDamageRollContext, modifiers: TCombatModifier[]): number {
	const modifierDamage = modifiers
		.flatMap((modifier) => modifier.damageRoll?.bonusFns ?? [])
		.reduce((total, bonusFn) => total + bonusFn(ctx), 0);

	return ctx.baseDamage + ctx.attacker.getDamageBonus() + modifierDamage;
}

/**
 * Определяет, сколько урона цель в итоге получает
 *
 * TODO: Добавить сюда сопротивление, уязвимость, иммунитет, временные хиты
 * и настоящее изменение HP (TODO: when add GWM/Bloodied feat or subclass that have kill condition)
 */
export function resolveAppliedDamage(rolledDamage: number): number {
	return rolledDamage;
}

/**
 * Полностью обрабатывает урон для одного успешного попадания
 *
 * AttackResolver должен вызывать это после того, как станет ясно, попала ли
 * атака и было ли попадание критическим
 */
export function resolveDamage(
	attacker: BaseCharacter,
	target: TCombatTarget,
	ctx: Omit<TDamageRollContext, "baseDamage" | "damageType">,
	modifiers: TCombatModifier[],
): TDamageResult {
	const damageType = attacker.weapon.damageType;
	const baseDamage = rollWeaponDamage(attacker, ctx.isCrit);
	const damageRollContext: TDamageRollContext = {
		...ctx,
		attacker,
		target,
		baseDamage,
		damageType,
	};
	const rolledDamage = resolveRolledDamage(damageRollContext, modifiers);
	const appliedDamage = resolveAppliedDamage(rolledDamage);

	return {
		rolledDamage,
		appliedDamage,
		damageType,
	};
}
