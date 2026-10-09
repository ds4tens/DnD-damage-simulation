import BaseCharacter from "../../character/BaseCharacter.ts";
import type { CombatHook } from "../../combat/CombatTypes.ts";
import { rerollDamageDie, rollDamageComponents } from "../../combat/damage/DamageResolver.ts";

/** PHB2024 p202 Tavern Brawler; secondary XPHB card checked2026-10-08.
 * https://5e.tools/feats.html#tavern%20brawler_xphb
 * Replace only the ordinary Unarmed component, then reroll each1 once and keep
 * the replacement. An Unarmed Strike remains eligible for class attack damage.
 */
export const tavernBrawlerHook: CombatHook = {
	id: "feat.tavern-brawler",
	featName: "tavern-brawler",
	weaponDamage(ctx, pool) {
		if (ctx.weapon || !ctx.character) return pool;
		return pool.flatMap((component) =>
			component.origin !== "unarmed"
				? [component]
				: rollDamageComponents(
						[
							{
								...component,
								dice: [4],
								flatBonus: ctx.character?.getStatModifier("strength") ?? 0,
								doublesOnCrit: true,
							},
						],
						ctx.hit.isCrit,
						ctx.damageRoller,
					),
		);
	},
	afterDamageRoll(ctx, pool) {
		if (ctx.weapon) return pool;
		let updated = pool;
		for (const component of pool)
			if (component.origin === "unarmed")
				for (const die of component.dice)
					if (die.value === 1 && ctx.useFeature("tavern-brawler.damage-rerolls"))
						updated = rerollDamageDie(updated, die.id, ctx.damageRoller);
		return updated;
	},
};
/** PHB2024 p203 Crusher; secondary XPHB card checked2026-10-08.
 * https://5e.tools/feats.html#crusher_xphb
 * All attacks against the critically damaged creature gain Advantage until the
 * source's next turn. Push is an explicitly excluded movement benefit.
 */
export const crusherHook: CombatHook = {
	id: "feat.crusher",
	featName: "crusher",
	onHit(ctx, pool) {
		if (!ctx.hit.isCrit || !pool.some((component) => component.damageType === "bludgeoning")) return;
		for (const id of ctx.encounter.ids)
			ctx.addEffect({
				kind: "crusher.enhanced-critical",
				sourceId: ctx.request.actorId,
				targetId: id,
				attackAdvantageAgainst: ctx.request.targetId,
				expires: "start-of-source-next-turn",
			});
	},
};
/** PHB2024 p207 Shield Master; secondary XPHB card checked2026-10-08.
 * https://5e.tools/feats.html#shield%20master_xphb
 * 2024 Shield Bash costs no Bonus Action. Only prone fits static geometry;
 * the push alternative remains an explicit per-benefit movement limitation.
 */
export const shieldMasterHook: CombatHook = {
	id: "feat.shield-master",
	featName: "shield-master",
	afterAttack(ctx, result) {
		if (
			!ctx.character ||
			!ctx.character.shieldEquipped ||
			!Object.values(ctx.actorState.hands).includes("$shield") ||
			!ctx.isOwnTurn ||
			ctx.request.actionSource !== "attack-action" ||
			ctx.weapon?.category !== "melee" ||
			!result.hit.isHit ||
			ctx.distance === undefined ||
			ctx.distance > 5 ||
			ctx.hasUsed("shield-master.shield-bash") ||
			!ctx.useFeature("shield-master.shield-bash")
		)
			return [];
		ctx.markUsed("shield-master.shield-bash");
		const save = ctx.resolveSavingThrow({
			targetId: ctx.request.targetId,
			ability: "strength",
			dc: 8 + ctx.character.getStatModifier("strength") + ctx.character.getProficiencyBonus(),
			source: "feat.shield-master.shield-bash",
		});
		if (!save.success && !ctx.targetState.conditions.some((c) => c.name === "prone"))
			ctx.targetState.conditions.push({ name: "prone", sourceId: ctx.request.actorId });
		return [];
	},
};

/** PHB2024 p204 Grappler; secondary XPHB checked2026-10-08.
 * https://5e.tools/feats.html#grappler_xphb
 * Damage+Grapple is once on the owner turn as part of the Attack action.
 * The engine validates free hand, size, save choice and grapple ownership.
 */
export const grapplerHook: CombatHook = {
	id: "feat.grappler",
	featName: "grappler",
	attackModifiers(ctx) {
		return ctx.targetState.grappledBy === ctx.request.actorId
			? [{ source: "feat.grappler.attack-advantage", attackRoll: { advantage: 1 } }]
			: [];
	},
	afterAttack(ctx, result) {
		if (
			ctx.weapon ||
			!result.hit.isHit ||
			!ctx.isOwnTurn ||
			ctx.request.actionSource !== "attack-action" ||
			ctx.hasUsed("grappler.punch-and-grab") ||
			!ctx.useFeature("grappler.punch-and-grab")
		)
			return [];
		const save = ctx.resolveGrapple(ctx.request.targetId);
		if (save !== undefined) ctx.markUsed("grappler.punch-and-grab");
		return [];
	},
};

const poisonPool = "feat.poisoner.doses";
const poisonKey = (id: string) => `poisoner.coating.${id}`;
/** PHB2024 p206 Poisoner; secondary XPHB card checked2026-10-08.
 * https://5e.tools/feats.html#poisoner_xphb
 * Doses are explicit stock, with no rest refill. Coated ammunition is spent on
 * the next shot even on a miss; a coated weapon lasts until damage or one minute.
 * Save damage is separate from the attack and never multiplied by a critical.
 * Poisoned outgoing attacks use the timed disadvantage; other enemy actions are
 * outside this DPR mode and remain an explicit limitation.
 */
export const poisonerHook: CombatHook = {
	id: "feat.poisoner",
	featName: "poisoner",
	resourceDefinitions(actor) {
		return actor instanceof BaseCharacter && actor.feats.some((f) => f.name === "poisoner")
			? [{ id: poisonPool, maxUses: actor.buildData?.stock.poisonDoses ?? 0, shortRest: "none", longRest: "none" }]
			: [];
	},
	ignoreResistance(ctx, _targetId, type) {
		return (
			type === "poison" && ctx.actor instanceof BaseCharacter && ctx.actor.feats.some((f) => f.name === "poisoner")
		);
	},
	featureActions(ctx) {
		if (
			!(ctx.actor instanceof BaseCharacter) ||
			ctx.encounter.resourceRemaining(ctx.actorId, poisonPool) === 0 ||
			!ctx.useFeature("poisoner.apply-poison")
		)
			return [];
		return ctx.encounter
			.weapons(ctx.actorId)
			.filter((instance) => !ctx.encounter.state(ctx.actorId).spentWeaponInstanceIds.has(instance.id))
			.map((instance) => ({
				id: `poisoner.apply.${instance.id}`,
				cost: "bonus-action" as const,
				execute: () => {
					ctx.encounter.spendResource(ctx.actorId, poisonPool);
					const state = ctx.encounter.state(ctx.actorId);
					state.classState[poisonKey(instance.id)] = state.ownTurnCount + 9;
					state.classState[`${poisonKey(instance.id)}.ammunition`] = instance.weapon.properties.includes("ammunition");
				},
			}));
	},
	afterAttack(ctx, result) {
		const id = ctx.request.weaponInstanceId ?? ctx.preparedWeapon?.instance.id;
		if (!id || !ctx.character) return [];
		const key = poisonKey(id);
		const expiry = ctx.actorState.classState[key];
		if (typeof expiry !== "number" || ctx.actorState.ownTurnCount > expiry) return [];
		const dealtDamage = (result.damage?.appliedDamage ?? 0) > 0;
		if (dealtDamage || ctx.actorState.classState[`${key}.ammunition`] === true) delete ctx.actorState.classState[key];
		if (!dealtDamage || ctx.targetState.lifeState === "dead") return [];
		const ability = ctx.character.feats.find((f) => f.name === "poisoner")?.abilityScoreImprovement?.[0]?.abilityScore;
		if (ability !== "dexterity" && ability !== "intelligence")
			throw new Error("Poisoner must retain its selected ASI ability");
		const source = "feat.poisoner.brew-poison";
		const save = ctx.resolveSavingThrow({
			targetId: ctx.request.targetId,
			ability: "constitution",
			dc: 8 + ctx.character.getProficiencyBonus() + ctx.character.getStatModifier(ability),
			source,
		});
		if (!save.success) {
			ctx.dealDamage(ctx.request.targetId, [
				{ id: source, source, damageType: "poison", origin: "feat", dice: [8, 8], flatBonus: 0, doublesOnCrit: false },
			]);
			ctx.addEffect({
				// This timed attack penalty is exposed as an effect, not a complete
				// Poisoned condition in TargetSnapshot; other branches are limitations.
				kind: `${source}.poisoned`,
				sourceId: ctx.request.actorId,
				targetId: ctx.request.targetId,
				attackDisadvantage: true,
				expires: { boundary: "end", combatantId: ctx.request.actorId, turnOccurrence: ctx.actorState.ownTurnCount + 1 },
			});
		}
		return [];
	},
	endTurn(ctx) {
		const state = ctx.encounter.state(ctx.actorId);
		for (const [key, expiry] of Object.entries(state.classState))
			if (key.startsWith("poisoner.coating.") && typeof expiry === "number" && state.ownTurnCount >= expiry)
				delete state.classState[key];
	},
	onElapsedTime(ctx) {
		for (const key of Object.keys(ctx.actorState.classState))
			if (key.startsWith("poisoner.coating.")) delete ctx.actorState.classState[key];
	},
};
/** PHB2024 p211 Boon of Irresistible Offense; primary BasicRules2024 checked
 * https://www.dndbeyond.com/sources/dnd/br-2024/feats#BoonofIrresistibleOffense
 * Extra natural20 damage is the selected score, never its modifier or new dice;
 * its type follows the prepared attack, including Pole Strike's Bludgeoning.
 */
export const irresistibleOffenseHook: CombatHook = {
	id: "feat.boon-of-irresistible-offense",
	featName: "boon-of-irresistible-offense",
	ignoreResistance(ctx, _targetId, type) {
		return (
			["bludgeoning", "piercing", "slashing"].includes(type) &&
			ctx.actor instanceof BaseCharacter &&
			ctx.actor.feats.some((f) => f.name === "boon-of-irresistible-offense")
		);
	},
	damageComponents(ctx) {
		if (!ctx.character || ctx.hit.d20Roll !== 20 || !ctx.useFeature("boon-of-irresistible-offense.overwhelming-strike"))
			return [];
		const ability = ctx.character.feats.find((f) => f.name === "boon-of-irresistible-offense")
			?.abilityScoreImprovement?.[0]?.abilityScore;
		if (ability !== "strength" && ability !== "dexterity")
			throw new Error("Overwhelming Strike requires its chosen score");
		return [
			{
				id: "boon-of-irresistible-offense.overwhelming-strike",
				source: "feat.boon-of-irresistible-offense.overwhelming-strike",
				damageType: ctx.preparedWeapon?.damageComponents[0]?.damageType ?? ctx.weapon?.damageType ?? "bludgeoning",
				origin: "feat",
				dice: [],
				flatBonus: ctx.character.stats[ability],
				doublesOnCrit: false,
			},
		];
	},
};
export const offensiveFeatHooks = Object.freeze({
	"tavern-brawler": tavernBrawlerHook,
	crusher: crusherHook,
	"shield-master": shieldMasterHook,
	grappler: grapplerHook,
	poisoner: poisonerHook,
	"boon-of-irresistible-offense": irresistibleOffenseHook,
});
