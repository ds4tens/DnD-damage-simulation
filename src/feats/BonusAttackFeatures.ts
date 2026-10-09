import BaseCharacter from "../character/BaseCharacter.ts";
import type { CombatHook, FeatureAction } from "../combat/CombatTypes.ts";
/** PHB2024 p203 Dual Wielder; XPHB secondary card checked2026-10-08.
 * https://5e.tools/feats.html#dual%20wielder_xphb
 * A Light Attack action attack (not necessarily a hit) earns an independent
 * Bonus Action with another non-Two-Handed Melee weapon, including with Nick.
 */
export const dualWielderHook: CombatHook = {
	id: "feat.dual-wielder",
	featName: "dual-wielder",
	afterAttack(ctx) {
		if (!ctx.isOwnTurn || ctx.request.actionSource !== "attack-action" || !ctx.weapon?.properties.includes("light"))
			return [];
		const id = ctx.request.weaponInstanceId ?? ctx.preparedWeapon?.instance.id;
		if (id) ctx.actorState.classState[`dual-wielder.source.${id}`] = ctx.encounter.turn.id;
		return [];
	},
	featureActions(ctx) {
		if (!(ctx.actor instanceof BaseCharacter)) return [];
		const inventory = ctx.encounter.weapons(ctx.actorId);
		const state = ctx.encounter.state(ctx.actorId);
		const sources = inventory.filter(
			(instance) => state.classState[`dual-wielder.source.${instance.id}`] === ctx.encounter.turn.id,
		);
		if (!sources.length || !ctx.useFeature("dual-wielder.enhanced-dual-wielding")) return [];
		const actions: FeatureAction[] = [];
		for (const instance of inventory) {
			if (
				instance.weapon.category !== "melee" ||
				instance.weapon.properties.includes("two-handed") ||
				!sources.some((source) => source.id !== instance.id) ||
				state.spentWeaponInstanceIds.has(instance.id)
			)
				continue;
			if (!Object.values(state.hands).includes(instance.id)) continue;
			for (const targetId of ctx.encounter.ids.filter(
				(id) => id !== ctx.actorId && ctx.encounter.state(id).lifeState !== "dead",
			))
				actions.push({
					id: `dual-wielder.attack.${instance.id}.${targetId}`,
					cost: "bonus-action",
					targetId,
					attack: {
						targetId,
						weaponInstanceId: instance.id,
						mode: "melee",
						attackOrigin: "dual-wielder",
					},
					attackDamage: {
						dice: instance.weapon.damage.map((die) => die.maxValue),
						damageType: instance.weapon.damageType,
						suppressPositiveAbility: true,
					},
				});
		}
		return actions;
	},
};
/** PHB2024 p206 Polearm Master; XPHB secondary card checked2026-10-08.
 * https://5e.tools/feats.html#polearm%20master_xphb
 * Pole Strike is immediately after a qualifying completed Attack action. The
 * engine-issued override retains the real instance/class/mastery eligibility.
 */
export const polearmMasterHook: CombatHook = {
	id: "feat.polearm-master",
	featName: "polearm-master",
	afterAttack(ctx) {
		if (
			!ctx.isOwnTurn ||
			ctx.request.actionSource !== "attack-action" ||
			!ctx.weapon ||
			!(
				ctx.weapon.id === "quarterstaff" ||
				ctx.weapon.id === "spear" ||
				(ctx.weapon.properties.includes("heavy") && ctx.weapon.properties.includes("reach"))
			)
		)
			return [];
		const id = ctx.request.weaponInstanceId ?? ctx.preparedWeapon?.instance.id;
		if (id) {
			ctx.actorState.classState["polearm-master.instance"] = id;
			ctx.actorState.classState["polearm-master.action"] = ctx.request.action?.id ?? ctx.request.actionId ?? "";
			ctx.actorState.classState["polearm-master.turn"] = ctx.encounter.turn.id;
		}
		return [];
	},
	featureActions(ctx) {
		if (!(ctx.actor instanceof BaseCharacter) || ctx.window !== "after-attack") return [];
		const state = ctx.encounter.state(ctx.actorId);
		const id = state.classState["polearm-master.instance"];
		if (
			typeof id !== "string" ||
			state.classState["polearm-master.turn"] !== ctx.encounter.turn.id ||
			ctx.completedAttackActionId !== state.classState["polearm-master.action"] ||
			!Object.values(state.hands).includes(id) ||
			!ctx.useFeature("polearm-master.pole-strike")
		)
			return [];
		return ctx.encounter.ids
			.filter((targetId) => targetId !== ctx.actorId && ctx.encounter.state(targetId).lifeState !== "dead")
			.map((targetId) => ({
				id: `polearm-master.attack.${id}.${targetId}`,
				cost: "bonus-action",
				targetId,
				attack: { targetId, weaponInstanceId: id, mode: "melee", attackOrigin: "pole-strike" },
				attackDamage: { dice: [4], damageType: "bludgeoning" },
			}));
	},
};
export const bonusAttackFeatHooks = Object.freeze({
	"dual-wielder": dualWielderHook,
	"polearm-master": polearmMasterHook,
});
