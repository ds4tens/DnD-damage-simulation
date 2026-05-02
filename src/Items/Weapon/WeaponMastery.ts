import type { TAttackContext } from "../../combat/CombatTypes.ts";
import { EConditionName } from "../../modifiers/Conditions.ts";
import type { TCombatModifier } from "../../modifiers/Modifiers.ts";

export enum EWeaponMastery {
	// CLEAVE = "cleave", // Need multiple targets to activate
	GRAZE = "graze",
	// NICK = "nick", // Need dual wielding
	// PUSH = "push", // usless only push target away from you
	// SAP = "sap", // usless until need monster to attack you
	// SLOW = "slow", // usless right now
	TOPPLE = "topple",
	// VEX = "vex", // Most efficient with Nick combo
}

export type TWeaponMastery = `${EWeaponMastery}`;

type TWeaponMasteryRule = {
	name: TWeaponMastery;
	getModifiers?: (mastery: TWeaponMastery, ctx: TAttackContext) => TCombatModifier[];
};

export const weaponMasteryRegistry: Record<TWeaponMastery, TWeaponMasteryRule> = {
	[EWeaponMastery.TOPPLE]: {
		name: EWeaponMastery.TOPPLE,
		getModifiers: (_mastery, _ctx) => {
			return [
				{
					source: "weaponMastery.topple",
					postHit: {
						effectFns: [
							(ctx) => {
								ctx.target.addCondition({
									name: EConditionName.PRONE,
									sourceId: "weaponMastery.topple",
								});
							},
						],
					},
				},
			];
		},
	},
	[EWeaponMastery.GRAZE]: {
		name: EWeaponMastery.GRAZE,
		getModifiers: (_mastery, _ctx) => {
			return [
				{
					source: "weaponMastery.graze",
					miss: {
						damageFns: [
							(ctx) => {
								if (ctx.hit.isHit) return 0;
								return ctx.attacker.getStatModifier(ctx.attacker.weaponPrimaryStat);
							},
						],
					},
				},
			];
		},
	},
};
