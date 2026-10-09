import type { CombatHook } from "../../combat/CombatTypes.ts";
import { hasWeaponMastery } from "../../combat/WeaponMasteryResolver.ts";
import type Weapon from "../../Items/Weapon.ts";
import Barbarian, { barbarianDprLimitations } from "../Barbarian.ts";

/** PHB 2024 p.56, XPHB reference entry; official World Tree preview cross-check. */
class WorldTree extends Barbarian {
	override readonly unsupportedFeatures = [
		...barbarianDprLimitations,
		"Vitality/Branches/Travel Along the Tree and Battering Roots Push require defensive or changing-position scenarios",
	];
	override getMeleeReachBonus(level: number, weapon: Weapon, isOwnTurn: boolean): number {
		return level >= 10 &&
			isOwnTurn &&
			weapon.category === "melee" &&
			(weapon.properties.includes("heavy") || weapon.properties.includes("versatile"))
			? 10
			: 0;
	}
	override getCombatHooks(level: number): readonly CombatHook[] {
		return [
			...super.getCombatHooks(level),
			{
				id: "class.barbarian.world-tree",
				afterHitDamage: (ctx) => {
					if (
						level < 10 ||
						!ctx.isOwnTurn ||
						ctx.request.mode !== "melee" ||
						!ctx.weapon ||
						!(ctx.weapon.properties.includes("heavy") || ctx.weapon.properties.includes("versatile")) ||
						(ctx.weapon.weaponMastery === "topple" &&
							hasWeaponMastery(ctx.encounter, ctx.request.actorId, ctx.weapon)) ||
						!ctx.useFeature("barbarian.world-tree.topple")
					)
						return;
					const result = ctx.resolveSavingThrow({
						source: "barbarian.world-tree.topple",
						targetId: ctx.request.targetId,
						ability: "constitution",
						dc:
							8 +
							(ctx.character?.getStatModifier(ctx.attackAbility) ?? 0) +
							(ctx.character?.getProficiencyBonus() ?? 0),
					});
					if (!result.success && !ctx.targetState.conditions.some((condition) => condition.name === "prone"))
						ctx.targetState.conditions.push({ name: "prone" });
				},
			},
		];
	}
}
export default WorldTree;
