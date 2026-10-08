import type { TPostHitContext } from "../../combat/CombatTypes.ts";
import type { TCombatModifier } from "../../modifiers/Modifiers.ts";
import Barbarian from "../Barbarian.ts";

/** Partial class support; Retaliation and the full Reckless Attack model are not implemented. */
class Berserker extends Barbarian {
	override getDamageRollModifiers(ctx: TPostHitContext): TCombatModifier[] {
		const base = super.getDamageRollModifiers(ctx);
		const character = ctx.character;
		if (
			!character ||
			character.level < 3 ||
			!ctx.isOwnTurn ||
			ctx.hasHitOccurredThisTurn ||
			ctx.actorState.classState.raging !== true ||
			!this.isUsingRecklessAttack(ctx)
		)
			return base;
		return [
			...base,
			{
				source: "barbarian.berserker.frenzy",
				damageRoll: {
					componentFns: [
						() => [
							{
								id: "barbarian.berserker.frenzy",
								source: "barbarian.berserker.frenzy",
								origin: "class",
								damageType: ctx.weapon?.damageType ?? "bludgeoning",
								dice: Array<number>(this.getRageDamageBonus(character.level)).fill(6),
								flatBonus: 0,
								doublesOnCrit: true,
							},
						],
					],
				},
			},
		];
	}
}
export default Berserker;
