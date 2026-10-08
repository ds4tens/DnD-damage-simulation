import type { TAttackContext, TPostHitContext, TTurnContext } from "../combat/CombatTypes.ts";
import type { DamageComponent } from "../combat/DamageTypes.ts";
export type TCombatModifier = {
	source: string;
	turn?: { canAct?: (ctx: TTurnContext) => boolean };
	attackRoll?: { advantage?: number; disadvantage?: number; bonusFns?: ((ctx: TAttackContext) => number)[] };
	hit?: { forceCritOnHit?: boolean };
	postHit?: { effectFns?: ((ctx: TPostHitContext) => void)[] };
	damageRoll?: { componentFns?: ((ctx: TPostHitContext) => readonly DamageComponent[])[] };
	miss?: { componentFns?: ((ctx: TPostHitContext) => readonly DamageComponent[])[] };
};
export const emptyCombatModifier: TCombatModifier = { source: "system.empty" };
export function mergeCombatModifiers(modifiers: readonly TCombatModifier[]): TCombatModifier {
	return {
		source: modifiers.map((modifier) => modifier.source).join("+") || emptyCombatModifier.source,
		turn: { canAct: (ctx) => modifiers.every((modifier) => modifier.turn?.canAct?.(ctx) ?? true) },
		attackRoll: {
			advantage: modifiers.reduce((total, modifier) => total + (modifier.attackRoll?.advantage ?? 0), 0),
			disadvantage: modifiers.reduce((total, modifier) => total + (modifier.attackRoll?.disadvantage ?? 0), 0),
			bonusFns: modifiers.flatMap((modifier) => modifier.attackRoll?.bonusFns ?? []),
		},
		hit: { forceCritOnHit: modifiers.some((modifier) => modifier.hit?.forceCritOnHit) },
		postHit: { effectFns: modifiers.flatMap((modifier) => modifier.postHit?.effectFns ?? []) },
		damageRoll: { componentFns: modifiers.flatMap((modifier) => modifier.damageRoll?.componentFns ?? []) },
		miss: { componentFns: modifiers.flatMap((modifier) => modifier.miss?.componentFns ?? []) },
	};
}
