import type {
	TApplyDamageContext,
	TAttackContext,
	TDamageRollContext,
	TMissContext,
	TPostHitContext,
	TTurnContext,
} from "../combat/CombatTypes.ts";
import type Dice from "../dice/dice.ts";

/**
 * Функция, которая возвращает числовой модификатор к броску атаки
 *
 * Примеры: бонус от Bless, бонус магического оружия, штраф от укрытия
 */
export type TAttackRollBonusFn = (ctx: TAttackContext) => number;

/**
 * Функция, которая возвращает дополнительный урон на этапе броска урона
 *
 * Примеры: Brutal Strike, Divine Fury, Sneak Attack, доп эффекты оружия
 */
export type TDamageRollBonusFn = (ctx: TDamageRollContext) => number;

export type TWeaponDamageRoll = {
	dice: Dice;
	roll: number;
	source: "weapon" | "crit" | "bonus";
};

export type TWeaponDamageRollContext = Omit<TDamageRollContext, "baseDamage"> & {
	rolls: TWeaponDamageRoll[];
};

export type TWeaponDamageDiceModifierFn = (ctx: TWeaponDamageRollContext) => TWeaponDamageRoll[];

/**
 * Эффект который применяется после успешного попадания атаки
 * Пример: условия Prone из Ram (WildHEart Barbarian)
 */
export type TPostHitEffectFn = (ctx: TPostHitContext) => void;

/**
 * Функция, которая изменяет уже брошенный урон перед применением к цели
 *
 * Примеры: сопротивление, уязвимость, иммунитет
 */
export type TAppliedDamageModifierFn = (ctx: TApplyDamageContext) => number;

export type TMissDamageFn = (ctx: TMissContext) => number;

/**
 * Один вклад правил боя из любого источника
 *
 * Источниками могут быть особенности класса и подкласса, состояния, оружие, заклинания,
 * черты монстров, магические предметы или правила столкновения. Резолверы собирают
 * множество объектов `TCombatModifier`, объединяют релевантные части и затем выполняют
 * фактический бросок или расчёт урона
 */
export type TCombatModifier = {
	/** id для отладки  */
	source: string;

	/** Модификаторы, которые могут запрещать или разрешать действие до начала атаки */
	turn?: {
		canAct?: (ctx: TTurnContext) => boolean;
	};

	/** Модификаторы, которые влияют на бросок атаки d20 */
	attackRoll?: {
		advantage?: number;
		disadvantage?: number;
		bonusFns?: TAttackRollBonusFn[];
	};

	/** Модификаторы, которые влияют на результат попадания после успешного броска d20 */
	hit?: {
		forceCritOnHit?: boolean;
	};

	/** Модификаторы, которые добавляют или меняют урон после попадания */
	postHit?: {
		effectFns?: TPostHitEffectFn[];
	};

	/**
	 * Модификаторы, которые добавляют урон на этапе броска урона
	 *
	 * Use this for extra rolled damage or flat bonuses that are added before
	 * target-side damage rules are applied. Examples: Rage damage, Divine Fury,
	 * Brutal Strike, Sneak Attack.
	 */
	damageRoll?: {
		bonusFns?: TDamageRollBonusFn[];
	};

	/** Модификаторы, которые влияют на бросок урона оружия
	 * Сейчас реализовано только для Piercer
	 */
	weaponDamageRoll?: {
		modifierFns?: TWeaponDamageDiceModifierFn[];
	};

	/** Модификаторы, которые изменяют урон после того, как он был брошен */
	appliedDamage?: {
		modifierFns?: TAppliedDamageModifierFn[];
	};

	/** Модификаторы, которые добавляют урон при промахе */
	miss?: {
		damageFns?: TMissDamageFn[];
	};
};

/**
 * Пустой модификатор, который резолверы используют, когда никакие модификаторы не применяются
 */
export const emptyCombatModifier: TCombatModifier = {
	source: "system.empty",
};

/**
 * Объединяет множество боевых модификаторов в один объект модификатора
 *
 * ВАЖНО! Это не разрешает конфликт Advantage vs Disadvantage ТОЛЬКО собирает источники модификаторов
 */
export function mergeCombatModifiers(modifiers: TCombatModifier[]): TCombatModifier {
	const merged: TCombatModifier = {
		source: modifiers.map((modifier) => modifier.source).join("+") || emptyCombatModifier.source,
		attackRoll: {
			advantage: modifiers.reduce((total, modifier) => total + (modifier.attackRoll?.advantage ?? 0), 0),
			disadvantage: modifiers.reduce((total, modifier) => total + (modifier.attackRoll?.disadvantage ?? 0), 0),
			bonusFns: modifiers.flatMap((modifier) => modifier.attackRoll?.bonusFns ?? []),
		},
		hit: {
			forceCritOnHit: modifiers.some((modifier) => modifier.hit?.forceCritOnHit),
		},
		postHit: {
			effectFns: modifiers.flatMap((modifier) => modifier.postHit?.effectFns ?? []),
		},
		damageRoll: {
			bonusFns: modifiers.flatMap((modifier) => modifier.damageRoll?.bonusFns ?? []),
		},
		weaponDamageRoll: {
			modifierFns: modifiers.flatMap((modifier) => modifier.weaponDamageRoll?.modifierFns ?? []),
		},
		appliedDamage: {
			modifierFns: modifiers.flatMap((modifier) => modifier.appliedDamage?.modifierFns ?? []),
		},
		miss: {
			damageFns: modifiers.flatMap((modifier) => modifier.miss?.damageFns ?? []),
		},
	};
	const canAct = modifiers.findLast((modifier) => modifier.turn?.canAct)?.turn?.canAct;

	if (canAct) {
		merged.turn = { canAct };
	}

	return merged;
}
