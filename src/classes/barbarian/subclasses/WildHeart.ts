import type { CombatHook, FeatureActionContext } from "../../../combat/CombatTypes.ts";
import Barbarian, { barbarianDprLimitations } from "../Barbarian.ts";

/** PHB 2024 p.55, XPHB reference entry; Ram is optional and has no save. */
class WildHeart extends Barbarian {
	override readonly unsupportedFeatures = [
		...barbarianDprLimitations,
		"Animal/Nature Speaker, Rage/Aspect of the Wilds, Falcon and Lion are casting, mobility, defensive or party features",
	];
	protected override onRageActivated(ctx: FeatureActionContext): void {
		if (!("level" in ctx.actor) || ctx.actor.level < 14) return;
		const chosen = ctx.chooseOption("barbarian.wild-heart.power", ["ram"]);
		const state = ctx.encounter.state(ctx.actorId);
		if (chosen === "ram" && state.barbarian) state.barbarian.wildHeartPower = chosen;
	}
	override getCombatHooks(level: number): readonly CombatHook[] {
		return [
			...super.getCombatHooks(level),
			{
				id: "class.barbarian.wild-heart",
				afterHitDamage: (ctx) => {
					if (
						level < 14 ||
						ctx.actorState.classState.raging !== true ||
						ctx.actorState.barbarian?.wildHeartPower !== "ram" ||
						ctx.request.mode !== "melee" ||
						!["tiny", "small", "medium", "large"].includes(ctx.encounter.size(ctx.request.targetId)) ||
						!ctx.useFeature("barbarian.wild-heart.ram")
					)
						return;
					if (!ctx.targetState.conditions.some((condition) => condition.name === "prone"))
						ctx.targetState.conditions.push({ name: "prone" });
				},
			},
		];
	}
}
export default WildHeart;
