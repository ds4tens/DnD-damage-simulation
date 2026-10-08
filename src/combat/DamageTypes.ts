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
export type HpChangeEvent = {
	targetId: string;
	previousHp: number;
	currentHp: number;
	damageTaken: number;
	hpLost: number;
	reducedToZero: boolean;
};
export type DamageResult = {
	components: DamagePool;
	rolledDamage: number;
	appliedDamage: number;
	byType: DamageByType;
	hp: HpChangeEvent;
};
