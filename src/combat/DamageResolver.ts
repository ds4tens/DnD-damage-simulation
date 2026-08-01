import type BaseCharacter from "../character/BaseCharacter.ts";
import type { TCombatModifier, TWeaponDamageRoll } from "../modifiers/Modifiers.ts";
import type { TCombatTarget, TDamageResult, TDamageRollContext } from "./CombatTypes.ts";

/**
 * Бросок урона оружия для одного успешного попадания
 *
 * Сейчас критические попадания удваивают только кости оружия. Постоянные
 * бонусы и бонусы от модификаторов добавляются один раз
 * FIXME TODO: roll bonus damage dice on crit
 */
export function rollWeaponDamageDice(attacker: BaseCharacter, isCrit: boolean): TWeaponDamageRoll[] {
	return attacker.weapon.damage.flatMap((dice) => {
		const rolls: TWeaponDamageRoll[] = [
			{
				dice,
				roll: dice.rollWithNormalDistribution(),
				source: "weapon",
			},
		];

		if (isCrit) {
			rolls.push({
				dice,
				roll: dice.rollWithNormalDistribution(),
				source: "crit",
			});
		}

		return rolls;
	});
}

export function rollWeaponDamage(ctx: Omit<TDamageRollContext, "baseDamage">, modifiers: TCombatModifier[]): number {
	const initialRolls = rollWeaponDamageDice(ctx.attacker, ctx.isCrit);
	const modifiedRolls = modifiers
		.flatMap((modifier) => modifier.weaponDamageRoll?.modifierFns ?? [])
		.reduce((rolls, modifierFn) => modifierFn({ ...ctx, rolls }), initialRolls);

	return modifiedRolls.reduce((totalDamage, result) => totalDamage + result.roll, 0);
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
	const baseDamage = rollWeaponDamage(
		{
			...ctx,
			attacker,
			target,
			damageType,
		},
		modifiers,
	);
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
