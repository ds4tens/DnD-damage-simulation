export type LifeState = "alive" | "dying" | "stable" | "dead";
export type DeathSaveState = { successes: number; failures: number };
export type ZeroHpBehavior = "death-saves" | "die";
export type HealingEvent = {
	targetId: string;
	previousHp: number;
	currentHp: number;
	hpRegained: number;
	previousLifeState: LifeState;
	currentLifeState: LifeState;
};
export type TemporaryHpEvent = {
	targetId: string;
	previousTemporaryHp: number;
	currentTemporaryHp: number;
	replaced: boolean;
};
export type DeathSaveResult = {
	targetId: string;
	natural: number;
	d20Rolls: readonly number[];
	total: number;
	success: boolean;
	previousDeathSaves: DeathSaveState;
	currentDeathSaves: DeathSaveState;
	previousLifeState: LifeState;
	currentLifeState: LifeState;
	hpRegained: number;
};
export type StabilizeResult = {
	actorId: string;
	targetId: string;
	d20Rolls: readonly number[];
	natural: number;
	bonus: number;
	total: number;
	success: boolean;
	previousLifeState: LifeState;
	currentLifeState: LifeState;
};
