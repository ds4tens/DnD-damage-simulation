import type { TAttackContext } from "../../combat/CombatTypes.ts";
import type { TCombatModifier } from "../../modifiers/Modifiers.ts";
export enum EWeaponMastery {
	GRAZE = "graze",
	TOPPLE = "topple",
}
export type TWeaponMastery = `${EWeaponMastery}`;
type TWeaponMasteryRule = {
	name: TWeaponMastery;
	supported: boolean;
	getModifiers?: (mastery: TWeaponMastery, ctx: TAttackContext) => TCombatModifier[];
};
export const weaponMasteryRegistry: Record<TWeaponMastery, TWeaponMasteryRule> = {
	[EWeaponMastery.TOPPLE]: { name: EWeaponMastery.TOPPLE, supported: false },
	[EWeaponMastery.GRAZE]: {
		name: EWeaponMastery.GRAZE,
		supported: true,
		getModifiers: (_mastery, ctx) => [
			{
				source: "weaponMastery.graze",
				miss: {
					componentFns: [
						() => [
							{
								id: "weaponMastery.graze",
								source: "weaponMastery.graze",
								origin: "other",
								damageType: ctx.weapon?.damageType ?? "bludgeoning",
								dice: [],
								flatBonus: Math.max(0, ctx.character?.getDamageBonus() ?? 0),
								doublesOnCrit: false,
							},
						],
					],
				},
			},
		],
	},
};
