import type { TPostHitContext } from "../../../combat/CombatTypes.ts";
import type { TCombatModifier } from "../../../modifiers/Modifiers.ts";
import Barbarian, { barbarianDprLimitations } from "../Barbarian.ts";

/** PHB 2024 p.57, XPHB reference entry; primary open rules omit this subclass. */
class Zealot extends Barbarian {
	override readonly unsupportedFeatures = [
		...barbarianDprLimitations,
		"Warrior of the Gods, Fanatical Focus and Rage of the Gods are defensive; Zealous Presence affects other creatures",
	];
	override getDamageRollModifiers(ctx: TPostHitContext): TCombatModifier[] {
		const base = super.getDamageRollModifiers(ctx);
		if (
			!ctx.character ||
			ctx.character.level < 3 ||
			!ctx.isOwnTurn ||
			ctx.hasUsed("barbarian.zealot.divine-fury") ||
			ctx.actorState.classState.raging !== true ||
			!(ctx.weapon || ctx.request.profile?.damage.some((component) => component.origin === "unarmed"))
		)
			return base;
		const fixtureType = ctx.actorState.classState.divineFuryType;
		if (fixtureType !== undefined && fixtureType !== "radiant" && fixtureType !== "necrotic")
			throw new Error("Divine Fury type must be radiant or necrotic");
		const selected = ctx.chooseOption(
			"barbarian.zealot.divine-fury.type",
			fixtureType === "necrotic" ? ["necrotic", "radiant"] : ["radiant", "necrotic"],
		);
		if (selected !== "radiant" && selected !== "necrotic") return base;
		ctx.markUsed("barbarian.zealot.divine-fury");
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
								damageType: selected,
								dice: [6],
								flatBonus: Math.floor((ctx.character?.level ?? 0) / 2),
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
