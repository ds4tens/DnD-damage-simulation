import type { TAttackContext } from "../../combat/CombatTypes.ts";
import type { TCombatModifier } from "../../modifiers/Modifiers.ts";
export enum EWeaponMastery {
	CLEAVE = "cleave",
	GRAZE = "graze",
	NICK = "nick",
	PUSH = "push",
	SAP = "sap",
	SLOW = "slow",
	TOPPLE = "topple",
	VEX = "vex",
}
export type TWeaponMastery = `${EWeaponMastery}`;
type TWeaponMasteryRule = {
	name: TWeaponMastery;
	supported: boolean;
	getModifiers?: (mastery: TWeaponMastery, ctx: TAttackContext) => TCombatModifier[];
};
export const weaponMasteryRegistry: Record<TWeaponMastery, TWeaponMasteryRule> = {
	[EWeaponMastery.CLEAVE]: { name: EWeaponMastery.CLEAVE, supported: true },
	[EWeaponMastery.NICK]: { name: EWeaponMastery.NICK, supported: true },
	[EWeaponMastery.PUSH]: { name: EWeaponMastery.PUSH, supported: false },
	[EWeaponMastery.SAP]: { name: EWeaponMastery.SAP, supported: true },
	[EWeaponMastery.SLOW]: { name: EWeaponMastery.SLOW, supported: true },
	[EWeaponMastery.TOPPLE]: { name: EWeaponMastery.TOPPLE, supported: true },
	[EWeaponMastery.VEX]: { name: EWeaponMastery.VEX, supported: true },
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
								flatBonus: Math.max(0, ctx.character?.getStatModifier(ctx.attackAbility) ?? 0),
								doublesOnCrit: false,
							},
						],
					],
				},
			},
		],
	},
};
