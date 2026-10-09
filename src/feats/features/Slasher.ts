import type { CombatHook } from "../../combat/CombatTypes.ts";

/** PHB 2024 p.208, Slasher; secondary text verified by P0 on 2026-10-08.
 * https://roll20.net/compendium/dnd5e/Feats%3ASlasher?expansion=32231&iframe=true
 * Equal effects do not stack; EncounterState retains each source's expiry.
 */
export const slasherHook: CombatHook = {
	id: "feat.slasher",
	featName: "slasher",
	onHit(ctx, pool) {
		if (!pool.some((component) => component.damageType === "slashing")) return;
		const effect = {
			sourceId: ctx.request.actorId,
			targetId: ctx.request.targetId,
			expires: "start-of-source-next-turn" as const,
		};
		if (!ctx.hasUsed("slasher.hamstring") && ctx.useFeature("slasher.hamstring")) {
			ctx.markUsed("slasher.hamstring");
			ctx.addEffect({ ...effect, kind: "slasher.hamstring", speedReduction: 10 });
		}
		if (ctx.hit.isCrit) ctx.addEffect({ ...effect, kind: "slasher.enhanced-critical", attackDisadvantage: true });
	},
};
