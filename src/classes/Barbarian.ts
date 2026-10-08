import type { TStatsType } from "../character/BaseCharacter.ts";
import type { TAttackContext, TPostHitContext } from "../combat/CombatTypes.ts";
import type { DamageComponent } from "../combat/DamageTypes.ts";
import type Weapon from "../Items/Weapon.ts";
import type { TCombatModifier } from "../modifiers/Modifiers.ts";
import BaseClass from "./BaseClass.ts";

/** Partial class support. Rage is scenario state, not a complete Rage action/duration model. */
class Barbarian extends BaseClass {
	override readonly savingThrowProficiencies: readonly TStatsType[] = ["strength", "constitution"];
	override getWeaponMasteryCount(level: number): number {
		return level >= 10 ? 4 : level >= 4 ? 3 : 2;
	}
	override readonly unsupportedFeatures: readonly string[] = [
		"Full Rage activation/resources/duration",
		"Configurable Reckless Attack and Brutal Strike decisions",
	];
	getRageDamageBonus(level: number): number {
		if (level <= 8) return 2;
		if (level <= 14) return 3;
		if (level <= 20) return 4;
		throw new Error(`Unsupported barbarian level: ${level}`);
	}
	canUseStrengthMeleeAttack(ctx: TAttackContext): boolean {
		return ctx.attackAbility === "strength" && ctx.request.mode === "melee";
	}
	shouldUseBrutalStrike(ctx: TAttackContext): boolean {
		return (ctx.character?.level ?? 0) >= 9 && ctx.attackIndexInTurn === 0 && this.canUseStrengthMeleeAttack(ctx);
	}
	isUsingRecklessAttack(ctx: TAttackContext): boolean {
		return (ctx.character?.level ?? 0) >= 2 && this.canUseStrengthMeleeAttack(ctx);
	}
	override getAttackCount(level: number): number {
		return level >= 5 ? 2 : 1;
	}
	override getAttackModifiers(ctx: TAttackContext): TCombatModifier[] {
		if (!this.isUsingRecklessAttack(ctx) || this.shouldUseBrutalStrike(ctx)) return [];
		return [{ source: "barbarian.reckless-attack", attackRoll: { advantage: 1 } }];
	}
	override canUseWeaponMastery(weapon: Weapon): boolean {
		return (
			weapon.category === "melee" &&
			(weapon.type === "simple" || weapon.type === "martial") &&
			weapon.weaponMastery !== undefined
		);
	}
	override getDamageRollModifiers(ctx: TPostHitContext): TCombatModifier[] {
		const character = ctx.character;
		if (!character) return [];
		const components: DamageComponent[] = [];
		const damageType = ctx.weapon?.damageType ?? "bludgeoning";
		if (ctx.actorState.classState.raging === true && this.canUseStrengthMeleeAttack(ctx)) {
			components.push({
				id: "barbarian.rage",
				source: "barbarian.rage",
				origin: "class",
				damageType,
				dice: [],
				flatBonus: this.getRageDamageBonus(character.level),
				doublesOnCrit: false,
			});
		}
		if (this.shouldUseBrutalStrike(ctx)) {
			components.push({
				id: "barbarian.brutal-strike",
				source: "barbarian.brutal-strike",
				origin: "class",
				damageType,
				dice: character.level < 17 ? [10] : [10, 10],
				flatBonus: 0,
				doublesOnCrit: true,
			});
		}
		return [{ source: "barbarian.damage", damageRoll: { componentFns: [() => components] } }];
	}
}
export default Barbarian;
