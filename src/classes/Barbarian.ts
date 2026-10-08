import type { TStatsType } from "../character/BaseCharacter.ts";
import BaseCharacter from "../character/BaseCharacter.ts";
import type { ResourceDefinition } from "../combat/CombatResources.ts";
import type { CombatHook, FeatureActionContext, TAttackContext, TPostHitContext } from "../combat/CombatTypes.ts";
import type { DamageComponent } from "../combat/DamageTypes.ts";
import type { CombatantState } from "../combat/EncounterState.ts";
import type Weapon from "../Items/Weapon.ts";
import type { TCombatModifier } from "../modifiers/Modifiers.ts";
import { endRage, extendRage, isReckless } from "./BarbarianState.ts";
import BaseClass from "./BaseClass.ts";

export const barbarianDprLimitations = [
	"Defensive, mobility and ability-check features are outside own weapon/Unarmed DPR",
	"Brutal Strike Forceful Blow requires changing positions; Sundering Blow benefits another creature",
] as const;

export const rageResourceId = "barbarian.rage";
export const persistentRageResourceId = "barbarian.persistent-rage";

/** PHB 2024 pp.51–53; Basic Rules 2024 Character Classes; errata v2.0, checked 2026-10-08. */
class Barbarian extends BaseClass {
	override readonly savingThrowProficiencies: readonly TStatsType[] = ["strength", "constitution"];
	override readonly unsupportedFeatures: readonly string[] = barbarianDprLimitations;
	override getWeaponMasteryCount(level: number): number {
		return level >= 10 ? 4 : level >= 4 ? 3 : 2;
	}
	getRageDamageBonus(level: number): number {
		return level >= 16 ? 4 : level >= 9 ? 3 : 2;
	}
	override getResourceDefinitions(level: number): readonly ResourceDefinition[] {
		return [
			{
				id: rageResourceId,
				maxUses: level >= 17 ? 6 : level >= 12 ? 5 : level >= 6 ? 4 : level >= 3 ? 3 : 2,
				shortRest: "one",
				longRest: "all",
			},
			...(level >= 15
				? [{ id: persistentRageResourceId, maxUses: 1, shortRest: "none" as const, longRest: "all" as const }]
				: []),
		];
	}
	isStrengthAttack(ctx: TAttackContext): boolean {
		return (
			ctx.attackAbility === "strength" &&
			(ctx.weapon !== undefined ||
				ctx.request.profile?.damage.some((component) => component.origin === "unarmed") === true)
		);
	}
	isUsingRecklessAttack(ctx: TAttackContext): boolean {
		return isReckless(ctx.actorState);
	}
	protected onRageActivated(_ctx: FeatureActionContext): void {}
	private reconcileRage(state: CombatantState, actor: BaseCharacter, level: number): void {
		if (state.classState.raging !== true) return;
		const endingConditions =
			level >= 15 ? ["unconscious"] : ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"];
		if (
			actor.armorCategory === "heavy" ||
			state.conditions.some((condition) => endingConditions.includes(condition.name))
		)
			endRage(state);
	}
	override getCombatHooks(level: number): readonly CombatHook[] {
		return [
			{
				id: "class.barbarian",
				featureActions: (ctx) => {
					if (!(ctx.actor instanceof BaseCharacter)) return [];
					const state = ctx.encounter.state(ctx.actorId);
					this.reconcileRage(state, ctx.actor, level);
					if (
						state.classState.raging !== true &&
						ctx.window === "before-attack" &&
						ctx.actor.armorCategory !== "heavy" &&
						ctx.encounter.resourceRemaining(ctx.actorId, rageResourceId) > 0
					) {
						return [
							{
								id: "barbarian.rage.activate",
								cost: "bonus-action",
								execute: (current) => {
									current.encounter.spendResource(current.actorId, rageResourceId);
									state.classState.raging = true;
									state.barbarian ??= {};
									state.barbarian.rage = {
										expiresOwnTurn: state.ownTurnCount + 1,
										maximumOwnTurn: state.ownTurnCount + 100,
										persistent: level >= 15,
									};
									this.onRageActivated(current);
								},
							},
						];
					}
					if (
						ctx.window === "after-attack" &&
						state.classState.raging === true &&
						state.barbarian?.rage &&
						!state.barbarian.rage.persistent &&
						state.barbarian.rage.expiresOwnTurn <= state.ownTurnCount
					) {
						return [{ id: "barbarian.rage.extend", cost: "bonus-action", execute: () => extendRage(state) }];
					}
					return state.classState.raging === true
						? [{ id: "barbarian.rage.dismiss", cost: "bonus-action", purpose: "end", execute: () => endRage(state) }]
						: [];
				},
				startTurn: (ctx) => {
					const state = ctx.encounter.state(ctx.actorId);
					if (!(ctx.actor instanceof BaseCharacter)) return;
					this.reconcileRage(state, ctx.actor, level);
					if (state.barbarian?.rage && state.ownTurnCount >= state.barbarian.rage.maximumOwnTurn) endRage(state);
				},
				endTurn: (ctx) => {
					const state = ctx.encounter.state(ctx.actorId);
					if (!(ctx.actor instanceof BaseCharacter)) return;
					this.reconcileRage(state, ctx.actor, level);
					if (
						state.barbarian?.rage &&
						!state.barbarian.rage.persistent &&
						state.ownTurnCount >= state.barbarian.rage.expiresOwnTurn
					)
						endRage(state);
				},
				beforeAttack: (ctx) => {
					if (!ctx.character) return;
					this.reconcileRage(ctx.actorState, ctx.character, level);
					if (ctx.request.targetId !== ctx.request.actorId) extendRage(ctx.actorState);
					if (
						level >= 2 &&
						ctx.isOwnTurn &&
						(ctx.encounter.turn.attackRollCounts.get(ctx.request.actorId) ?? 0) === 0 &&
						ctx.useFeature("barbarian.reckless-attack")
					) {
						ctx.actorState.barbarian ??= {};
						ctx.actorState.barbarian.recklessExpiresOwnTurn = ctx.actorState.ownTurnCount + 1;
					}
				},
				prepareAttack: (ctx, modifier) => {
					if (
						level < 9 ||
						!ctx.isOwnTurn ||
						!this.isStrengthAttack(ctx) ||
						!isReckless(ctx.actorState) ||
						ctx.hasUsed("barbarian.brutal-strike") ||
						(modifier.attackRoll?.advantage ?? 0) <= 0 ||
						(modifier.attackRoll?.disadvantage ?? 0) > 0 ||
						!ctx.useFeature("barbarian.brutal-strike")
					)
						return modifier;
					ctx.markUsed("barbarian.brutal-strike");
					ctx.featureSelections["barbarian.brutal-strike"] = true;
					return { ...modifier, attackRoll: { ...modifier.attackRoll, advantage: 0 } };
				},
				afterHitDamage: (ctx) => {
					if (ctx.featureSelections["barbarian.brutal-strike"] !== true) return;
					const available = level >= 13 ? ["staggering-blow", "hamstring-blow"] : ["hamstring-blow"];
					for (let index = 0; index < (level >= 17 ? 2 : 1); index++) {
						const selected = ctx.chooseOption("barbarian.brutal-strike.effect", available);
						if (selected === null) break;
						available.splice(available.indexOf(selected), 1);
						ctx.addEffect({
							kind: `barbarian.${selected}`,
							sourceId: ctx.request.actorId,
							targetId: ctx.request.targetId,
							expires: "start-of-source-next-turn",
							...(selected === "hamstring-blow"
								? { speedReduction: 15 }
								: { savingThrowDisadvantage: true, consumeOnSavingThrow: true }),
						});
					}
				},
				onInitiative: (ctx) => {
					if (
						level < 15 ||
						ctx.encounter.resourceRemaining(ctx.actorId, persistentRageResourceId) === 0 ||
						ctx.encounter.resourceRemaining(ctx.actorId, rageResourceId) ===
							ctx.encounter.state(ctx.actorId).resources[rageResourceId]?.definition.maxUses ||
						!ctx.useFeature("barbarian.persistent-rage")
					)
						return;
					ctx.encounter.spendResource(ctx.actorId, persistentRageResourceId);
					ctx.encounter.restoreResource(ctx.actorId, rageResourceId);
				},
			},
		];
	}
	override getInitiativeAdvantage(level: number): boolean {
		return level >= 7;
	}
	override getAttackCount(level: number): number {
		return level >= 5 ? 2 : 1;
	}
	override getAttackModifiers(ctx: TAttackContext): TCombatModifier[] {
		return isReckless(ctx.actorState) && this.isStrengthAttack(ctx)
			? [{ source: "barbarian.reckless-attack", attackRoll: { advantage: 1 } }]
			: [];
	}
	override canUseWeaponMastery(weapon: Weapon): boolean {
		return (
			weapon.category === "melee" &&
			(weapon.type === "simple" || weapon.type === "martial") &&
			weapon.weaponMastery !== undefined
		);
	}
	override getDamageRollModifiers(ctx: TPostHitContext): TCombatModifier[] {
		if (!ctx.character) return [];
		const components: DamageComponent[] = [];
		const damageType = ctx.preparedWeapon?.damageComponents[0]?.damageType ?? ctx.weapon?.damageType ?? "bludgeoning";
		if (ctx.actorState.classState.raging === true && this.isStrengthAttack(ctx))
			components.push({
				id: rageResourceId,
				source: rageResourceId,
				origin: "class",
				damageType,
				dice: [],
				flatBonus: this.getRageDamageBonus(ctx.character.level),
				doublesOnCrit: false,
			});
		if (ctx.featureSelections["barbarian.brutal-strike"] === true)
			components.push({
				id: "barbarian.brutal-strike",
				source: "barbarian.brutal-strike",
				origin: "class",
				damageType,
				dice: ctx.character.level >= 17 ? [10, 10] : [10],
				flatBonus: 0,
				doublesOnCrit: true,
			});
		return components.length === 0
			? []
			: [{ source: "barbarian.damage", damageRoll: { componentFns: [() => components] } }];
	}
}
export default Barbarian;
