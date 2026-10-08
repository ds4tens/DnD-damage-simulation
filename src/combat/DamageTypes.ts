import type { DeathSaveState, LifeState } from "./HitPointTypes.ts";

export type DamageType =
	| "acid"
	| "bludgeoning"
	| "cold"
	| "fire"
	| "force"
	| "lightning"
	| "necrotic"
	| "piercing"
	| "poison"
	| "psychic"
	| "radiant"
	| "slashing"
	| "thunder";
export type DamageOrigin = "weapon" | "class" | "feat" | "unarmed" | "other";
export type DamageComponent = {
	id: string;
	damageType: DamageType;
	source: string;
	origin: DamageOrigin;
	dice: readonly number[];
	flatBonus: number;
	doublesOnCrit: boolean;
};
export type RolledDamageDie = {
	id: string;
	componentId: string;
	sides: number;
	value: number;
	provenance: "base" | "critical-copy" | "additional";
	rerolledFrom?: number;
};
export type RolledDamageComponent = Omit<DamageComponent, "dice"> & { dice: readonly RolledDamageDie[] };
export type DamagePool = readonly RolledDamageComponent[];
export type DamageByType = Partial<Record<DamageType, number>>;
export type DamageDefenses = {
	resistances: readonly DamageType[];
	immunities: readonly DamageType[];
	vulnerabilities: readonly DamageType[];
};
export type HpChangeEvent = {
	targetId: string;
	previousHp: number;
	currentHp: number;
	damageTaken: number;
	hpLost: number;
	reducedToZero: boolean;
	previousTemporaryHp: number;
	currentTemporaryHp: number;
	temporaryHpLost: number;
	overflow: number;
	previousLifeState: LifeState;
	currentLifeState: LifeState;
	previousDeathSaves: DeathSaveState;
	currentDeathSaves: DeathSaveState;
};
export type DamageResult = {
	components: DamagePool;
	rolledDamage: number;
	appliedDamage: number;
	byType: DamageByType;
	appliedByType: DamageByType;
	hp: HpChangeEvent;
};
