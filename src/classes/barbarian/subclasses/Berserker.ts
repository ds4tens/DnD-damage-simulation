import type { TPostHitContext } from "../../../combat/CombatTypes.ts";
import type { TCombatModifier } from "../../../modifiers/Modifiers.ts";
import Barbarian, { barbarianDprLimitations } from "../Barbarian.ts";

/** PHB 2024 p.54 / Basic Rules 2024 Berserker; checked 2026-10-08. */
class Berserker extends Barbarian {
	override readonly unsupportedFeatures = [
		...barbarianDprLimitations,
		"Mindless Rage, Retaliation and Intimidating Presence require enemy actions/defensive scenarios",
	];
	override getDamageRollModifiers(ctx: TPostHitContext): TCombatModifier[] {
		const base = super.getDamageRollModifiers(ctx);
		if (
			!ctx.character ||
			ctx.character.level < 3 ||
			!ctx.isOwnTurn ||
			ctx.hasUsed("barbarian.berserker.frenzy") ||
			ctx.actorState.classState.raging !== true ||
			!this.isUsingRecklessAttack(ctx) ||
			!this.isStrengthAttack(ctx)
		)
			return base;
		ctx.markUsed("barbarian.berserker.frenzy");
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
								damageType:
									ctx.preparedWeapon?.damageComponents[0]?.damageType ?? ctx.weapon?.damageType ?? "bludgeoning",
								dice: Array<number>(this.getRageDamageBonus(ctx.character?.level ?? 0)).fill(6),
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
