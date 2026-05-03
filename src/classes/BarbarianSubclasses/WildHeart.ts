import type { TDamageRollContext, TPostHitContext } from "../../combat/CombatTypes.ts";
import { EConditionName } from "../../modifiers/Conditions.ts";
import type { TCombatModifier } from "../../modifiers/Modifiers.ts";
import Barbarian from "../Barbarian.ts";

/**
 * Path of the Wild Heart skeleton
 */
class WildHeart extends Barbarian {
	/**
	 * Ram. While your Rage is active, you can cause a Large or smaller creature to have the Prone condition
	 * when you hit it with a melee attack.
	 */
	getRamPostHitModifiers(ctx: TPostHitContext): TCombatModifier[] {
		if (!this.isRaging || (ctx.distance !== undefined && ctx.distance > 5)) return [];

		return [
			{
				source: "barbarian.wild-heart.ram",
				postHit: {
					effectFns: [
						(postHitCtx) => {
							// TODO: check size condition
							postHitCtx.target.addCondition({
								name: EConditionName.PRONE,
								sourceId: "barbarian.wild-heart.ram",
							});
						},
					],
				},
			},
		];
	}

	override getPostHitModifiers(ctx: TPostHitContext): TCombatModifier[] {
		return [...super.getPostHitModifiers(ctx), ...this.getRamPostHitModifiers(ctx)];
	}

	override getDamageRollModifiers(ctx: TDamageRollContext): TCombatModifier[] {
		return super.getDamageRollModifiers(ctx);
	}
}

export default WildHeart;
