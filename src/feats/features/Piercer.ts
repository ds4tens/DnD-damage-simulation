import type { CombatHook } from "../../combat/CombatTypes.ts";
import { allDamageDice, appendAdditionalDie, rerollDamageDie } from "../../combat/damage/DamageResolver.ts";

/** PHB 2024 p.206, Piercer (Roll20 book text); checked 2026-10-08.
 * https://roll20.net/compendium/dnd5e/Feats%3APiercer?expansion=32231
 * Additional die size is selected from piercing dice; default strategy takes largest.
 * Flat-only piercing has no eligible critical die: no artificial die is created.
 */
export const piercerHook: CombatHook = {
	id: "feat.piercer",
	featName: "piercer",
	additionalCriticalDice(ctx, pool) {
		if (!ctx.hit.isCrit) return pool;
		const dice = pool.filter((component) => component.damageType === "piercing").flatMap((component) => component.dice);
		if (dice.length === 0) return pool;
		const chosenId = ctx.choosePiercerCriticalDie(dice);
		if (chosenId === null) return pool;
		const chosen = dice.find((die) => die.id === chosenId);
		if (!chosen) throw new Error("Invalid Piercer critical die choice");
		let id = "feat.piercer.enhanced-critical";
		while (pool.some((component) => component.id === id)) id += ":additional";
		return appendAdditionalDie(
			pool,
			{ id, source: "feat.piercer.enhanced-critical", origin: "feat", damageType: "piercing", flatBonus: 0 },
			chosen.sides,
			ctx.damageRoller,
		);
	},
	afterDamageRoll(ctx, pool) {
		if (
			(!pool.some((component) => component.damageType === "piercing") &&
				(ctx.primaryDamage?.byType.piercing ?? 0) <= 0) ||
			ctx.hasUsed("piercer.puncture")
		)
			return pool;
		const dice = allDamageDice(pool);
		if (dice.length === 0) return pool;
		const chosenId = ctx.choosePunctureDie(dice);
		if (chosenId === null) return pool;
		const result = rerollDamageDie(pool, chosenId, ctx.damageRoller);
		ctx.markUsed("piercer.puncture");
		return result;
	},
};
