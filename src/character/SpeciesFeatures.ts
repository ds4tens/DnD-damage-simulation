import type { CombatHook, FeatureActionContext } from "../combat/CombatTypes.ts";
import type { DamageComponent, DamageType } from "../combat/DamageTypes.ts";
import BaseCharacter from "./BaseCharacter.ts";

const flatDamage = (source: string, damageType: DamageType, flatBonus: number): DamageComponent => ({
	id: source,
	source,
	damageType,
	flatBonus,
	origin: "other",
	dice: [],
	doublesOnCrit: false,
});
const revelation = "species.aasimar.celestial-revelation";
const largeForm = "species.goliath.large-form";
function active(ctx: FeatureActionContext, id: string): boolean {
	return ctx.encounter.state(ctx.actorId).classState[`${id}.active`] === true;
}

/** PHB2024 p192; primary Goliath card checked2026-10-08.
 * https://www.dndbeyond.com/sources/dnd/br-2024/character-origins#Goliath
 * Fire/Frost are additional attack damage dice, including critical copies, but only
 * become eligible after the attack actually deals damage. The separate ledger
 * entry preserves each damage type's defenses without doubling other components.
 */
export const goliathHook: CombatHook = {
	id: "species.goliath",
	resourceDefinitions(actor) {
		if (!(actor instanceof BaseCharacter) || actor.buildData?.species.id !== "goliath") return [];
		return [
			{
				id: "species.goliath.giant-ancestry",
				maxUses: actor.getProficiencyBonus(),
				shortRest: "none",
				longRest: "all",
			},
			...(actor.level >= 5
				? [{ id: largeForm, maxUses: 1, shortRest: "none" as const, longRest: "all" as const }]
				: []),
		];
	},
	featureActions(ctx) {
		if (!(ctx.actor instanceof BaseCharacter) || ctx.actor.buildData?.species.id !== "goliath" || ctx.actor.level < 5)
			return [];
		if (active(ctx, largeForm) && ctx.chooseOption("goliath.large-form.duration", ["continue", "end"]) === "end")
			return [
				{
					id: `${largeForm}.end`,
					cost: "none",
					execute: (ctx) => {
						ctx.encounter.state(ctx.actorId).classState[`${largeForm}.active`] = false;
						delete ctx.encounter.state(ctx.actorId).sizeOverride;
						delete ctx.encounter.state(ctx.actorId).speedBonus;
					},
				},
			];
		if (
			active(ctx, largeForm) ||
			ctx.encounter.resourceRemaining(ctx.actorId, largeForm) === 0 ||
			!ctx.useFeature(largeForm)
		)
			return [];
		return [
			{
				id: `${largeForm}.activate`,
				cost: "bonus-action",
				execute: (ctx) => {
					ctx.encounter.spendResource(ctx.actorId, largeForm);
					const state = ctx.encounter.state(ctx.actorId);
					state.classState[`${largeForm}.active`] = true;
					state.classState[`${largeForm}.expires`] = state.ownTurnCount + 99;
					state.sizeOverride = "large";
					state.speedBonus = 10;
				},
			},
		];
	},
	endTurn(ctx) {
		const state = ctx.encounter.state(ctx.actorId);
		if (active(ctx, largeForm) && state.ownTurnCount >= Number(state.classState[`${largeForm}.expires`])) {
			state.classState[`${largeForm}.active`] = false;
			delete state.sizeOverride;
			delete state.speedBonus;
		}
	},
	onElapsedTime(ctx) {
		if (!(ctx.actor instanceof BaseCharacter) || ctx.actor.buildData?.species.id !== "goliath") return;
		ctx.actorState.classState[`${largeForm}.active`] = false;
		delete ctx.actorState.classState[`${largeForm}.expires`];
		delete ctx.actorState.sizeOverride;
		delete ctx.actorState.speedBonus;
	},
	afterPrimaryDamage(ctx, result) {
		const species = ctx.character?.buildData?.species;
		if (
			species?.id !== "goliath" ||
			!["fire", "frost", "hill"].includes(species.ancestry) ||
			!result.hit.isHit ||
			(result.damage?.appliedDamage ?? 0) <= 0
		)
			return;
		if (species.ancestry === "hill" && ["huge", "gargantuan"].includes(ctx.encounter.size(ctx.request.targetId)))
			return;
		const resource = "species.goliath.giant-ancestry";
		if (
			ctx.encounter.resourceRemaining(ctx.request.actorId, resource) === 0 ||
			!ctx.useFeature(`goliath.giant-ancestry.${species.ancestry}`)
		)
			return;
		ctx.encounter.spendResource(ctx.request.actorId, resource);
		if (species.ancestry === "hill") {
			if (!ctx.targetState.conditions.some((condition) => condition.name === "prone"))
				ctx.targetState.conditions.push({ name: "prone", sourceId: ctx.request.actorId });
			return;
		}
		const source = `species.goliath.giant-ancestry.${species.ancestry}`;
		ctx.dealAttackRiderDamage(ctx.request.targetId, [
			{
				id: source,
				source,
				origin: "other",
				damageType: species.ancestry === "fire" ? "fire" : "cold",
				dice: [species.ancestry === "fire" ? 10 : 6],
				flatBonus: 0,
				doublesOnCrit: true,
			},
		]);
		if (species.ancestry === "frost")
			ctx.addEffect({
				kind: source,
				sourceId: ctx.request.actorId,
				targetId: ctx.request.targetId,
				expires: "start-of-source-next-turn",
				speedReduction: 10,
			});
	},
};

/** PHB2024 p186 Aasimar (not included in open BasicRules); XPHB card
 * https://5e.tools/races.html#aasimar_xphb checked2026-10-08.
 * Each transformation chooses its form. Extra attack damage is once on an own
 * turn; Inner Radiance is an independent end-of-turn source, never critical.
 * "Each creature" includes the emitter; its Radiant Resistance applies normally.
 * Frightened enemy actions and flying movement are reported per-benefit stubs.
 */
export const aasimarHook: CombatHook = {
	id: "species.aasimar",
	resourceDefinitions(actor) {
		return actor instanceof BaseCharacter && actor.buildData?.species.id === "aasimar" && actor.level >= 3
			? [{ id: revelation, maxUses: 1, shortRest: "none", longRest: "all" }]
			: [];
	},
	featureActions(ctx) {
		if (!(ctx.actor instanceof BaseCharacter) || ctx.actor.buildData?.species.id !== "aasimar" || ctx.actor.level < 3)
			return [];
		if (active(ctx, revelation))
			return ctx.chooseOption("aasimar.celestial-revelation.duration", ["continue", "end"]) === "end"
				? [
						{
							id: `${revelation}.end`,
							cost: "none",
							execute: (ctx) => {
								ctx.encounter.state(ctx.actorId).classState[`${revelation}.active`] = false;
							},
						},
					]
				: [];
		if (
			ctx.encounter.resourceRemaining(ctx.actorId, revelation) === 0 ||
			!ctx.useFeature("aasimar.celestial-revelation")
		)
			return [];
		return [
			{
				id: `${revelation}.activate`,
				cost: "bonus-action",
				execute: (ctx) => {
					const form = ctx.chooseOption("aasimar.celestial-revelation.form", [
						"inner-radiance",
						"heavenly-wings",
						"necrotic-shroud",
					]);
					if (form === null) throw new Error("Aasimar activation requires a form choice");
					ctx.encounter.spendResource(ctx.actorId, revelation);
					const state = ctx.encounter.state(ctx.actorId);
					state.classState[`${revelation}.active`] = true;
					state.classState[`${revelation}.form`] = form;
					state.classState[`${revelation}.expires`] = state.ownTurnCount + 9;
				},
			},
		];
	},
	onElapsedTime(ctx) {
		if (!(ctx.actor instanceof BaseCharacter) || ctx.actor.buildData?.species.id !== "aasimar") return;
		ctx.actorState.classState[`${revelation}.active`] = false;
		delete ctx.actorState.classState[`${revelation}.form`];
		delete ctx.actorState.classState[`${revelation}.expires`];
	},
	afterPrimaryDamage(ctx, result) {
		if (
			ctx.character?.buildData?.species.id !== "aasimar" ||
			ctx.actorState.classState[`${revelation}.active`] !== true ||
			!ctx.isOwnTurn ||
			(result.damage?.appliedDamage ?? 0) <= 0 ||
			ctx.hasUsed("aasimar.celestial-revelation.damage") ||
			!ctx.useFeature("aasimar.celestial-revelation.damage")
		)
			return;
		ctx.markUsed("aasimar.celestial-revelation.damage");
		ctx.dealAttackRiderDamage(ctx.request.targetId, [
			flatDamage(
				`${revelation}.damage`,
				ctx.actorState.classState[`${revelation}.form`] === "necrotic-shroud" ? "necrotic" : "radiant",
				ctx.character.getProficiencyBonus(),
			),
		]);
	},
	endTurn(ctx) {
		if (!(ctx.actor instanceof BaseCharacter) || !active(ctx, revelation)) return;
		const state = ctx.encounter.state(ctx.actorId);
		if (state.classState[`${revelation}.form`] === "inner-radiance") {
			for (const id of ctx.encounter.ids) {
				if (ctx.encounter.state(id).lifeState === "dead") continue;
				const distance = id === ctx.actorId ? 0 : ctx.distanceTo(id);
				if (distance !== undefined && distance <= 10)
					ctx.dealDamage(id, [flatDamage(`${revelation}.inner-radiance`, "radiant", ctx.actor.getProficiencyBonus())]);
			}
		}
		if (state.ownTurnCount >= Number(state.classState[`${revelation}.expires`]))
			state.classState[`${revelation}.active`] = false;
	},
};
export const speciesCombatHooks: readonly CombatHook[] = Object.freeze([
	Object.freeze(goliathHook),
	Object.freeze(aasimarHook),
]);
