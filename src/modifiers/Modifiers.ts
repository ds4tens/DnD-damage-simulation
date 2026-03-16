export type TAttackContext = {
	attackIndexInTurn: number;
	hasHitOccurredThisTurn: boolean;
	isFirstHitOfTurn: boolean;
};

export type TDamageModifierFn = (ctx: TAttackContext) => number;

type TBasicAttackModifier = {
	hasAdvantage?: boolean;
	hasDisadvantage?: boolean;
};

type THitModifierPart = { hasHitModifier: true; hitModifierFunction: () => number } | { hasHitModifier?: false };

type TDamageModifierPart =
	| { hasDamageModifier: true; damageModifierFunctions: TDamageModifierFn[] }
	| { hasDamageModifier?: false };

export type TAttackModifier = TBasicAttackModifier & THitModifierPart & TDamageModifierPart;
