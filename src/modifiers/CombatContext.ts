import type BaseCharacter from "../character/BaseCharacter.ts";

export type TAttackContext = {
	attackIndexInTurn: number;
	hasHitOccurredThisTurn: boolean;
	isFirstHitOfTurn: boolean;
};

// TODO: Использовать когда добавлю действия врага
export type TTurnContext = {
	actor: BaseCharacter;
};

export type TAttackPipelineContext = {
	attacker: BaseCharacter;
	target: BaseCharacter;
	attackIndexInTurn: number;
	hasHitOccurredThisTurn: boolean;
	distance?: number; // TODO: Понадобится когда будут дальнобойные атаки типа луков
};

export type TDamagePipelineContext = {
	attacker: BaseCharacter;
	target: BaseCharacter;
	attackIndexInTurn: number;
	hasHitOccurredThisTurn: boolean;
	isFirstHitOfTurn: boolean;
	isCrit: boolean;
	damageType: string;
	baseDamage: number;
};

export type TApplyDamageContext = {
	attacker: BaseCharacter;
	target: BaseCharacter;
	damage: number;
	damageType: string;
	isCrit: boolean;
};
