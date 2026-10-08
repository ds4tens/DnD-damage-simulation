import type { TStatsType } from "../character/BaseCharacter.ts";
import type { CombatHook, TAttackContext, TPostHitContext, TTurnContext } from "../combat/CombatTypes.ts";
import type { ResourceDefinition } from "../combat/state/CombatResources.ts";
import type Weapon from "../items/weapons/Weapon.ts";
import type { TCombatModifier } from "../modifiers/Modifiers.ts";

/** Passive class definition: mutable combat resources belong to EncounterState. */
class BaseClass {
	readonly savingThrowProficiencies: readonly TStatsType[] = [];
	readonly unsupportedFeatures: readonly string[] = [];
	readonly weaponProficiencies: readonly Weapon[];
	constructor(weaponProficiencies: readonly Weapon[]) {
		this.weaponProficiencies = [...weaponProficiencies];
	}
	isProficientWithWeapon(weapon: Weapon): boolean {
		return this.weaponProficiencies.some((item) => item.name === weapon.name);
	}
	getWeaponMasteryCount(_level: number): number {
		return 0;
	}
	getResourceDefinitions(_level: number): readonly ResourceDefinition[] {
		return [];
	}
	getCombatHooks(_level: number): readonly CombatHook[] {
		return [];
	}
	getMeleeReachBonus(_level: number, _weapon: Weapon, _isOwnTurn: boolean): number {
		return 0;
	}
	getInitiativeAdvantage(_level: number): boolean {
		return false;
	}
	getAttackCount(_level: number): number {
		return 1;
	}
	getTurnModifiers(_ctx: TTurnContext): TCombatModifier[] {
		return [];
	}
	getAttackModifiers(_ctx: TAttackContext): TCombatModifier[] {
		return [];
	}
	canUseWeaponMastery(_weapon: Weapon): boolean {
		return false;
	}
	getPostHitModifiers(_ctx: TPostHitContext): TCombatModifier[] {
		return [];
	}
	getDamageRollModifiers(_ctx: TPostHitContext): TCombatModifier[] {
		return [];
	}
}
export default BaseClass;
