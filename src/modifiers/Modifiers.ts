type TBasicAttackModifier = {
	hasAdvantage?: boolean;
	hasDisadvantage?: boolean;
};

type THitModifierPart = { hasHitModifier: true; hitModifierFunction: () => number } | { hasHitModifier?: false };

type TDamageModifierPart =
	| { hasDamageModifier: true; damageModifierFunction: () => number }
	| { hasDamageModifier?: false };

export type TAttackModifier = TBasicAttackModifier & THitModifierPart & TDamageModifierPart;
