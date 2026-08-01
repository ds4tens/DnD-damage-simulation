import type BaseCharacter from "../character/BaseCharacter.ts";
import Dice from "../dice/dice.ts";
import { featRegistry, type TFeatRule } from "../feats/Feats.ts";
import { weaponMasteryRegistry } from "../Items/Weapon/WeaponMastery.ts";
import { conditionRegistry } from "../modifiers/Conditions.ts";
import { mergeCombatModifiers, type TCombatModifier } from "../modifiers/Modifiers.ts";
import type {
	TAttackContext,
	TAttackResult,
	TAttackTurnResult,
	TCombatTarget,
	TDamageRollContext,
	THitResult,
	TTurnContext,
} from "./CombatTypes.ts";
import { resolveAppliedDamage, resolveDamage } from "./DamageResolver.ts";

// TODO: у воина будет свой порог крита, нужно будет посмотреть где используется
const DEFAULT_CRIT_THRESHOLD = 20;

/**
 * Собирает модификаторы от активных состояний персонажа в начале хода
 */
export function collectTurnConditionModifiers(ctx: TTurnContext): TCombatModifier[] {
	return ctx.actor.conditions.flatMap((condition) => {
		const rule = conditionRegistry[condition.name];
		return rule.getTurnModifiers?.(condition, ctx) ?? [];
	});
}

/**
 * Собирает модификаторы от состояний атакующего и цели для одной атаки
 */
export function collectAttackConditionModifiers(ctx: TAttackContext): TCombatModifier[] {
	const outgoingModifiers = ctx.attacker.conditions.flatMap((condition) => {
		const rule = conditionRegistry[condition.name];
		return rule.getOutgoingAttackModifiers?.(condition, ctx) ?? [];
	});
	const incomingModifiers = ctx.target.conditions.flatMap((condition) => {
		const rule = conditionRegistry[condition.name];
		return rule.getIncomingAttackModifiers?.(condition, ctx) ?? [];
	});

	return [...outgoingModifiers, ...incomingModifiers];
}

/**
 * Собирает модификаторы от weapon mastery
 */
export function collectWeaponMasteryModifiers(ctx: TAttackContext): TCombatModifier[] {
	const mastery = ctx.attacker.weapon.weaponMastery;

	if (mastery === undefined || !ctx.attacker.characterClass.canUseWeaponMastery(ctx.attacker.weapon)) {
		return [];
	}

	return weaponMasteryRegistry[mastery]?.getModifiers?.(mastery, ctx) ?? [];
}

/**
 * Собирает модификаторы урона от feats атакующего.
 */
export function collectFeatDamageRollModifiers(ctx: TDamageRollContext): TCombatModifier[] {
	return ctx.attacker.feats.flatMap((feat) => {
		const rule = featRegistry[feat.name as keyof typeof featRegistry] as TFeatRule | undefined;
		return rule?.getDamageRollModifiers?.(feat, ctx) ?? [];
	});
}

/**
 * Проверяет, позволяют ли собранные модификаторы действовать в этот ход
 * TODO: пока нет ответных действий монстра, поэтому проверить что не используется
 */
export function canAct(ctx: TTurnContext, modifiers: TCombatModifier[]): boolean {
	return modifiers.every((modifier) => modifier.turn?.canAct?.(ctx) ?? true);
}

/**
 * Бросок к20 с учетом итогового преимущества или помехи
 *
 * Если есть и преимущество, и помеха, они взаимно отменяются
 */
export function rollAttackD20(modifier: TCombatModifier): number {
	const hasAdvantage = (modifier.attackRoll?.advantage ?? 0) > 0;
	const hasDisadvantage = (modifier.attackRoll?.disadvantage ?? 0) > 0;
	const d20 = new Dice(20);

	if (hasAdvantage && !hasDisadvantage) {
		return Math.max(d20.rollWithNormalDistribution(), d20.rollWithNormalDistribution());
	}

	if (hasDisadvantage && !hasAdvantage) {
		return Math.min(d20.rollWithNormalDistribution(), d20.rollWithNormalDistribution());
	}

	return d20.rollWithNormalDistribution();
}

/**
 * Определяет попадание, промах или крит для одного броска атаки
 *
 * TODO: Натуральные 1/20 в итоге должны зависеть от чистого результата d20,
 * а не только от totalAttackRoll. Пока здесь сохранено прежнее поведение,
 * чтобы его было проще отследить
 */
export function resolveHit(ctx: TAttackContext, modifier: TCombatModifier): THitResult {
	const d20Roll = rollAttackD20(modifier);
	const modifierBonus = (modifier.attackRoll?.bonusFns ?? []).reduce((total, bonusFn) => total + bonusFn(ctx), 0);
	const totalAttackRoll = d20Roll + ctx.attacker.getAttackBonus() + modifierBonus;
	const isHit = totalAttackRoll >= ctx.target.armorClass;
	const isNaturalCrit = totalAttackRoll >= DEFAULT_CRIT_THRESHOLD;
	const isForcedCrit = Boolean(modifier.hit?.forceCritOnHit && isHit);

	return {
		d20Roll,
		totalAttackRoll,
		isHit,
		isCrit: isNaturalCrit || isForcedCrit,
	};
}

/**
 * Обрабатывает одну попытку атаки по цели
 */
export function resolveSingleAttack(ctx: TAttackContext): TAttackResult {
	const modifiers = [
		...ctx.attacker.characterClass.getAttackModifiers(ctx),
		...collectAttackConditionModifiers(ctx),
		...collectWeaponMasteryModifiers(ctx),
	];
	const mergedModifier = mergeCombatModifiers(modifiers);
	const hit = resolveHit(ctx, mergedModifier);

	if (!hit.isHit) {
		const rolledDamage = (mergedModifier.miss?.damageFns ?? []).reduce(
			(total, damageFn) => total + damageFn({ ...ctx, hit }),
			0,
		);
		const damage =
			rolledDamage > 0
				? {
						rolledDamage,
						appliedDamage: resolveAppliedDamage(rolledDamage),
						damageType: ctx.attacker.weapon.damageType,
					}
				: undefined;

		return {
			attackIndexInTurn: ctx.attackIndexInTurn,
			hit,
			...(damage === undefined ? {} : { damage }),
		};
	}

	const postHitContext = {
		...ctx,
		hit,
	};
	const postHitModifiers = ctx.attacker.characterClass.getPostHitModifiers(postHitContext);
	[mergedModifier, ...postHitModifiers]
		.flatMap((modifier) => modifier.postHit?.effectFns ?? [])
		.forEach((effectFn) => {
			effectFn(postHitContext);
		});

	const damageRollContext: TDamageRollContext = {
		...ctx,
		isCrit: hit.isCrit,
		isFirstHitOfTurn: !ctx.hasHitOccurredThisTurn,
		damageType: ctx.attacker.weapon.damageType,
		baseDamage: 0,
	};
	const damageModifiers = [
		...ctx.attacker.characterClass.getDamageRollModifiers(damageRollContext),
		...collectFeatDamageRollModifiers(damageRollContext),
	];
	const damage = resolveDamage(
		ctx.attacker,
		ctx.target,
		{
			...ctx,
			isCrit: hit.isCrit,
			isFirstHitOfTurn: !ctx.hasHitOccurredThisTurn,
		},
		[mergedModifier, ...damageModifiers],
	);

	return {
		attackIndexInTurn: ctx.attackIndexInTurn,
		hit,
		damage,
	};
}

/**
 * Обрабатывает все атаки оружием, которые атакующий проводит по цели за ход
 *
 * Это основная точка входа для симуляции DPR. Она намеренно возвращает
 * подробный результат, а не просто число, чтобы потом было проще разбирать
 * спорные случаи
 */
export function resolveAttackTurn(
	attacker: BaseCharacter,
	target: TCombatTarget,
	distance?: number,
): TAttackTurnResult {
	const turnContext: TTurnContext = { actor: attacker };
	const turnModifiers = [
		...attacker.characterClass.getTurnModifiers(turnContext),
		...collectTurnConditionModifiers(turnContext),
	];

	if (!canAct(turnContext, turnModifiers)) {
		return { totalDamage: 0, attacks: [] };
	}

	const attacks: TAttackResult[] = [];
	let hasHitOccurredThisTurn = false;

	for (
		let attackIndexInTurn = 0;
		attackIndexInTurn < attacker.characterClass.getAttackCount(attacker.level);
		attackIndexInTurn++
	) {
		const attackContext: TAttackContext = {
			attacker,
			target,
			attackIndexInTurn,
			hasHitOccurredThisTurn,
			...(distance === undefined ? {} : { distance }),
		};
		const attack = resolveSingleAttack(attackContext);
		attacks.push(attack);
		hasHitOccurredThisTurn = hasHitOccurredThisTurn || attack.hit.isHit;
	}

	return {
		totalDamage: attacks.reduce((total, attack) => total + (attack.damage?.appliedDamage ?? 0), 0),
		attacks,
	};
}
