import BaseCharacter from "../character/BaseCharacter.ts";
import type Weapon from "../Items/Weapon.ts";
import { EConditionName } from "../modifiers/Conditions.ts";
import type { TCombatModifier } from "../modifiers/Modifiers.ts";
import type { AttackContext, AttackResult, MasteryHitContribution } from "./CombatTypes.ts";
import type { DamageComponent } from "./DamageTypes.ts";
import type { EffectExpiry, EffectInput, EncounterState } from "./EncounterState.ts";
import type { SavingThrowRequest, SavingThrowResult } from "./SavingThrowTypes.ts";

/** Basic Rules 2024 Equipment / Mastery Properties, SRD 5.2.1 p.90.
 * https://www.dndbeyond.com/sources/dnd/br-2024/equipment#MasteryProperties
 * Verified 2026-10-08 with PHB errata v2.0. Costs and state application belong to A.
 */
export function hasWeaponMastery(encounter: EncounterState, actorId: string, weapon: Weapon): boolean {
	const actor = encounter.definition(actorId);
	return (
		actor instanceof BaseCharacter &&
		((actor.characterClass.canUseWeaponMastery(weapon) &&
			encounter.masteredWeaponNames(actorId).some((name) => name === weapon.name || name === weapon.id)) ||
			actor.buildData?.featMasteredWeaponIds.some((id) => id === weapon.id) === true)
	);
}

/** Sap/Vex modifiers live in timed effects and are consumed by the engine on roll. */
export function masteryAttackModifiers(_ctx: AttackContext): readonly TCombatModifier[] {
	return [];
}

export function masteryMissComponents(ctx: AttackContext): readonly DamageComponent[] {
	if (
		!ctx.hit ||
		ctx.hit.isHit ||
		ctx.weapon?.weaponMastery !== "graze" ||
		!hasWeaponMastery(ctx.encounter, ctx.request.actorId, ctx.weapon)
	)
		return [];
	if (!ctx.useFeature("weaponMastery.graze")) return [];
	return [
		{
			id: "weaponMastery.graze",
			source: "weaponMastery.graze",
			origin: "other",
			damageType: ctx.weapon.damageType,
			dice: [],
			flatBonus: Math.max(0, ctx.character?.getStatModifier(ctx.attackAbility) ?? 0),
			doublesOnCrit: false,
		},
	];
}

function nextSourceTurn(ctx: AttackContext, boundary: "start" | "end"): EffectExpiry {
	return { boundary, combatantId: ctx.request.actorId, turnOccurrence: ctx.actorState.ownTurnCount + 1 };
}

export function resolveMasteryHit(
	ctx: AttackContext,
	result: AttackResult,
	callbacks: { save: (request: SavingThrowRequest) => SavingThrowResult },
): MasteryHitContribution {
	if (!result.hit.isHit || !ctx.weapon || !hasWeaponMastery(ctx.encounter, ctx.request.actorId, ctx.weapon)) return {};
	const actorId = ctx.request.actorId;
	const targetId = ctx.request.targetId;
	const effects: EffectInput[] = [];
	switch (ctx.weapon.weaponMastery) {
		case "sap":
			effects.push({
				kind: "weaponMastery.sap",
				sourceId: actorId,
				targetId,
				expires: nextSourceTurn(ctx, "start"),
				attackDisadvantage: true,
				consumeOnAttack: { actorId: targetId },
			});
			return { effects };
		case "slow":
			if ((result.damage?.hp.damageTaken ?? 0) <= 0 || !ctx.useFeature("weaponMastery.slow")) return {};
			effects.push({
				kind: "weaponMastery.slow",
				sourceId: actorId,
				targetId,
				expires: nextSourceTurn(ctx, "start"),
				speedReduction: 10,
			});
			return { effects };
		case "vex":
			if ((result.damage?.hp.damageTaken ?? 0) <= 0) return {};
			effects.push({
				kind: "weaponMastery.vex",
				sourceId: actorId,
				targetId: actorId,
				expires: nextSourceTurn(ctx, "end"),
				attackAdvantageAgainst: targetId,
				consumeOnAttack: { actorId, targetId },
			});
			return { effects };
		case "topple": {
			if (!ctx.useFeature("weaponMastery.topple")) return {};
			const dc =
				8 + (ctx.character?.getStatModifier(ctx.attackAbility) ?? 0) + (ctx.character?.getProficiencyBonus() ?? 0);
			const savingThrow = callbacks.save({ targetId, ability: "constitution", dc, source: "weaponMastery.topple" });
			return {
				savingThrows: [savingThrow],
				...(savingThrow.success ? {} : { addConditions: [{ name: EConditionName.PRONE, sourceId: actorId }] }),
			};
		}
		case "cleave":
			return ctx.request.mode === "melee" && !ctx.hasUsed("weaponMastery.cleave") ? { cleaveEligible: true } : {};
		default:
			return {};
	}
}
