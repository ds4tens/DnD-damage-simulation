import type { CombatHook } from "../../combat/CombatTypes.ts";

/** Basic Rules 2024, Feats / Savage Attacker; checked 2026-10-08.
 * https://www.dndbeyond.com/sources/dnd/br-2024/feats#SavageAttacker
 * Critical copies participate in the complete weapon pool (agreed interpretation).
 */
export const savageAttackerHook: CombatHook = {
	id: "feat.savage-attacker",
	featName: "savage-attacker",
	weaponDamage(ctx, pool) {
		if (
			!ctx.weapon ||
			!pool.some((component) => component.dice.length > 0) ||
			ctx.hasUsed("savage-attacker") ||
			!ctx.useFeature("savage-attacker")
		)
			return pool;
		const second = pool.map((component) => ({
			...component,
			dice: component.dice.map((die) => ({ ...die, value: ctx.damageRoller.roll(die.sides) })),
		}));
		const candidates = [pool, second];
		const selected = candidates[ctx.chooseWeaponRoll(candidates)];
		if (!selected) throw new Error("Invalid Savage Attacker weapon pool choice");
		ctx.markUsed("savage-attacker");
		return selected;
	},
};
