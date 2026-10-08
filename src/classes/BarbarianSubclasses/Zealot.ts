import type { TPostHitContext } from "../../combat/CombatTypes.ts";
import type { TCombatModifier } from "../../modifiers/Modifiers.ts";
import Barbarian from "../Barbarian.ts";

/** Partial class support. Configure Divine Fury's type in encounter classState.divineFuryType. */
class Zealot extends Barbarian {
	override getDamageRollModifiers(ctx: TPostHitContext): TCombatModifier[] {
		const base = super.getDamageRollModifiers(ctx);
		const character = ctx.character;
		if (
			!character ||
			character.level < 3 ||
			!ctx.isOwnTurn ||
			ctx.hasHitOccurredThisTurn ||
			ctx.actorState.classState.raging !== true
		)
			return base;
		const selectedType = ctx.actorState.classState.divineFuryType ?? "radiant";
		if (selectedType !== "radiant" && selectedType !== "necrotic")
			throw new Error("Divine Fury type must be radiant or necrotic");
		return [
			...base,
			{
				source: "barbarian.zealot.divine-fury",
				damageRoll: {
					componentFns: [
						() => [
							{
								id: "barbarian.zealot.divine-fury",
								source: "barbarian.zealot.divine-fury",
								origin: "class",
								damageType: selectedType,
								dice: [6],
								flatBonus: Math.floor(character.level / 2),
								doublesOnCrit: true,
							},
						],
					],
				},
			},
		];
	}
}
export default Zealot;
