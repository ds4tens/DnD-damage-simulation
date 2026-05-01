import type { TAttackContext } from "./CombatContext.ts";

export type { TAttackContext } from "./CombatContext.ts";

export type TDamageModifierFn = (ctx: TAttackContext) => number;

type TBasicAttackModifier = {
	hasAdvantage?: boolean;
	hasDisadvantage?: boolean;
	forceCritOnHit?: boolean;
};

type THitModifierPart = { hasHitModifier: true; hitModifierFunction: () => number } | { hasHitModifier?: false };

type TDamageModifierPart =
	| { hasDamageModifier: true; damageModifierFunctions: TDamageModifierFn[] }
	| { hasDamageModifier?: false };

export type TAttackModifier = TBasicAttackModifier & THitModifierPart & TDamageModifierPart;
