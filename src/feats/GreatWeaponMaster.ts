import type { CombatHook } from "../combat/CombatTypes.ts";

/** Great Weapon Master, PHB 2024; official Bobby pregen, Feats section.
 * https://media.dndbeyond.com/compendium-images/uhlh/downloads/bobby-character-sheet.pdf
 * Verified by P0 on 2026-10-08. Hew's Bonus Action is consumed by CombatEngine.
 */
export const greatWeaponMasterHook: CombatHook = {
	id: "feat.great-weapon-master",
	featName: "great-weapon-master",
	damageComponents(ctx) {
		if (
			!ctx.isOwnTurn ||
			ctx.request.actionSource !== "attack-action" ||
			!ctx.weapon?.properties.includes("heavy") ||
			!ctx.character ||
			!ctx.useFeature("great-weapon-master.heavy-weapon-mastery")
		)
			return [];
		return [
			{
				id: "great-weapon-master.heavy-weapon-mastery",
				source: "feat.great-weapon-master.heavy-weapon-mastery",
				origin: "feat",
				damageType: ctx.weapon.damageType,
				dice: [],
				flatBonus: ctx.character.getProficiencyBonus(),
				doublesOnCrit: false,
			},
		];
	},
	afterAttack(ctx, result) {
		if (
			ctx.weapon?.category !== "melee" ||
			!ctx.encounter.canUseBonusAction(ctx.request.actorId) ||
			!((result.hit.isHit && result.hit.isCrit) || result.damage?.hp.reducedToZero)
		)
			return [];
		const targetId = ctx.chooseHewTarget();
		return targetId === null ? [] : [{ targetId, source: "feat.great-weapon-master.hew" }];
	},
};
