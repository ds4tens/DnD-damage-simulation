import type { TAttackContext, TDamageRollContext, TPostHitContext } from "../combat/CombatTypes.ts";
import Dice from "../dice/dice.ts";
import type Weapon from "../Items/Weapon.ts";
import type { TCombatModifier } from "../modifiers/Modifiers.ts";
import BaseClass from "./BaseClass.ts";

/**
 * Barbarian class skeleton
 */
class Barbarian extends BaseClass {
	isRaging: boolean;

	constructor(weaponProficiencies: Weapon[]) {
		super(weaponProficiencies);
		this.isRaging = false;
	}

	/**
	 * Запускает Rage для симуляций, где считается, что Варвар её использует.
	 *
	 * TODO: перенести в полноценный резолвер Bonus Action
	 */
	startRage() {
		this.isRaging = true;
	}

	getRageDamageBonus(level: number): number {
		if (level <= 8) return 2;
		if (level <= 14) return 3;
		if (level <= 20) return 4;
		throw new Error(`Unsupported barbarian level: ${level}`);
	}

	getBrutalStrikeDamageBonus(level: number): number {
		if (level < 9) return 0;
		if (level < 17) return new Dice(10).rollWithNormalDistribution();
		return new Dice(10).rollWithNormalDistribution() + new Dice(10).rollWithNormalDistribution();
	}

	canUseStrengthMeleeAttack(ctx: TAttackContext | TDamageRollContext): boolean {
		const isStrengthBased = ctx.attacker.weaponPrimaryStat === "strength";
		const isMelee = ctx.distance === undefined || ctx.distance <= 5;

		return isStrengthBased && isMelee;
	}

	shouldUseBrutalStrike(ctx: TAttackContext | TDamageRollContext): boolean {
		return ctx.attacker.level >= 9 && ctx.attackIndexInTurn === 0 && this.canUseStrengthMeleeAttack(ctx);
	}

	isUsingRecklessAttack(ctx: TAttackContext | TDamageRollContext): boolean {
		return ctx.attacker.level >= 2 && this.canUseStrengthMeleeAttack(ctx);
	}

	shouldApplyRecklessAttackAdvantage(ctx: TAttackContext): boolean {
		return this.isUsingRecklessAttack(ctx) && !this.shouldUseBrutalStrike(ctx);
	}

	override getAttackCount(level: number): number {
		return level >= 5 ? 2 : 1;
	}

	/**
	 * Return attack-roll modifiers from Barbarian features
	 */
	override getAttackModifiers(ctx: TAttackContext): TCombatModifier[] {
		if (!this.shouldApplyRecklessAttackAdvantage(ctx)) return [];
		const modifiers: TCombatModifier[] = [];
		modifiers.push({
			source: "barbarian.reckless-attack",
			attackRoll: {
				advantage: 1,
			},
		});

		return modifiers;
	}

	override canUseWeaponMastery(weapon: Weapon): boolean {
		return this.weaponProficiencies.some(
			(proficientWeapon) => proficientWeapon.name === weapon.name && proficientWeapon.weaponMastery !== undefined,
		);
	}

	// TODO: Probably should add here some post-hit modifiers for weapon-mastery features
	override getPostHitModifiers(_ctx: TPostHitContext): TCombatModifier[] {
		return [];
	}

	/**
	 * Return damage-roll modifiers from Barbarian features
	 */
	override getDamageRollModifiers(ctx: TDamageRollContext): TCombatModifier[] {
		const modifiers: TCombatModifier[] = [];

		if (this.isRaging && this.canUseStrengthMeleeAttack(ctx)) {
			modifiers.push({
				source: "barbarian.rage",
				damageRoll: {
					bonusFns: [(damageCtx) => this.getRageDamageBonus(damageCtx.attacker.level)],
				},
			});
		}

		if (this.shouldUseBrutalStrike(ctx)) {
			modifiers.push({
				source: "barbarian.brutal-strike",
				damageRoll: {
					bonusFns: [(damageCtx) => this.getBrutalStrikeDamageBonus(damageCtx.attacker.level)],
				},
			});
		}

		return modifiers;
	}
}

export default Barbarian;
