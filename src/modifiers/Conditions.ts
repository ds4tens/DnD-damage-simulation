import type {
	TApplyDamageContext,
	TAttackPipelineContext,
	TDamagePipelineContext,
	TTurnContext,
} from "./CombatContext.ts";
import type { TAttackModifier } from "./Modifiers.ts";

export enum EConditionName {
	BLINDED = "blinded",
	POISONED = "poisoned",
	RESTRAINED = "restrained",
	PARALYZED = "paralyzed",
	STUNNED = "stunned",
	UNCONSCIOUS = "unconscious",
	PRONE = "prone",
	INVISIBLE = "invisible",
	INCAPACITATED = "incapacitated",
	EXHAUSTION = "exhaustion",
	GRAPPLED = "grappled",
}

export type TConditionName = `${EConditionName}`;

export type TConditionState = {
	name: TConditionName;
	duration?: number; // duration in rounds
	sourceID?: string; // IDK look like useless
	level?: number;
};

export type TConditionRule = {
	name: TConditionName;
	modifyOutgoingAttack?: (ctx: TAttackPipelineContext) => Partial<TAttackModifier>;
	modifyIncomingAttack?: (ctx: TAttackPipelineContext) => Partial<TAttackModifier>;
	modifyDamageRoll?: (ctx: TDamagePipelineContext) => number;
	modifyAppliedDamage?: (ctx: TApplyDamageContext) => number;
	canAct?: (ctx: TTurnContext) => boolean;
};

export const conditionRegistry: Record<TConditionName, TConditionRule> = {
	/*
	While you have the Blinded condition, you experience the following effects.
	- Can't See. You can't see and automatically fail any ability check that requires sight.
	- Attacks Affected. Attack rolls against you have Advantage, and your attack rolls have Disadvantage. 
	*/
	[EConditionName.BLINDED]: {
		name: EConditionName.BLINDED,
		modifyOutgoingAttack: () => ({
			hasDisadvantage: true,
		}),
		modifyIncomingAttack: () => ({
			hasAdvantage: true,
		}),
	},
	/*
	While you have the Poisoned condition, you experience the following effect.
	- Ability Checks and Attacks Affected. You have Disadvantage on attack rolls and ability checks
	*/
	[EConditionName.POISONED]: {
		name: EConditionName.POISONED,
		modifyOutgoingAttack: () => ({
			hasDisadvantage: true,
		}),
	},
	/* 
	While you have the Restrained condition, you experience the following effects.
	- Speed 0. Your Speed is 0 and can't increase.
	- Attacks Affected. Attack rolls against you have Advantage, and your attack rolls have Disadvantage.
	- Saving Throws Affected. You have Disadvantage on Dexterity saving throws.
	*/
	[EConditionName.RESTRAINED]: {
		name: EConditionName.RESTRAINED,
		modifyOutgoingAttack: () => ({
			hasDisadvantage: true,
		}),
		modifyIncomingAttack: () => ({
			hasAdvantage: true,
		}),
	},
	/*
	While you have the Paralyzed condition, you experience the following effects.
	- Incapacitated. You have the Incapacitated condition.
	- Speed 0. Your Speed is 0 and can't increase.
	- Saving Throws Affected. You automatically fail Strength and Dexterity saving throws.
	- Attacks Affected. Attack rolls against you have Advantage.
	- Automatic Critical Hits. Any attack roll that hits you is a Critical Hit if the attacker is within 5 feet of you.
	 */
	[EConditionName.PARALYZED]: {
		name: EConditionName.PARALYZED,
		canAct: () => false,
		modifyIncomingAttack: (ctx) => ({
			hasAdvantage: true,
			forceCritOnHit: ctx.distance !== undefined && ctx.distance <= 5,
		}),
	},
	/*
	While you have the Stunned condition, you experience the following effects.
	- Incapacitated. You have the Incapacitated condition.
	- Saving Throws Affected. You automatically fail Strength and Dexterity saving throws.
	- Attacks Affected. Attack rolls against you have Advantage.
	*/
	[EConditionName.STUNNED]: {
		name: EConditionName.STUNNED,
		canAct: () => false,
		modifyIncomingAttack: () => ({
			hasAdvantage: true,
		}),
	},
	/*
	While you have the Unconscious condition, you experience the following effects.
	- Inert. You have the Incapacitated and Prone conditions, and you drop whatever you're holding. When this condition ends, you remain Prone.
	- Speed 0. Your Speed is 0 and can't increase.
	- Attacks Affected. Attack rolls against you have Advantage.
	- Saving Throws Affected. You automatically fail Strength and Dexterity saving throws.
	- Automatic Critical Hits. Any attack roll that hits you is a Critical Hit if the attacker is within 5 feet of you.
	- Unaware. You're unaware of your surroundings. 
	*/
	[EConditionName.UNCONSCIOUS]: {
		name: EConditionName.UNCONSCIOUS,
		canAct: () => false,
		modifyIncomingAttack: (ctx) => ({
			hasAdvantage: true,
			forceCritOnHit: ctx.distance !== undefined && ctx.distance <= 5,
		}),
	},
	/*
	While you have the Prone condition, you experience the following effects.
	- Restricted Movement. Your only movement options are to crawl or to spend an amount of movement equal to half your Speed (round down) to right yourself and thereby end the condition. If your Speed is 0, you can't right yourself.
	- Attacks Affected. You have Disadvantage on attack rolls. An attack roll against you has Advantage if the attacker is within 5 feet of you. Otherwise, that attack roll has Disadvantage.
	*/
	[EConditionName.PRONE]: {
		name: EConditionName.PRONE,
		modifyOutgoingAttack: () => ({
			hasDisadvantage: true,
		}),
		modifyIncomingAttack: (ctx) => ({
			hasAdvantage: ctx.distance !== undefined && ctx.distance <= 5,
			hasDisadvantage: ctx.distance !== undefined && ctx.distance > 5,
		}),
	},
	/*
	While you have the Invisible condition, you experience the following effects.
	- Surprise. If you're Invisible when you roll Initiative, you have Advantage on the roll.
	- Concealed. You aren't affected by any effect that requires its target to be seen unless the effect's creator can somehow see you. Any equipment you are wearing or carrying is also concealed.
	- Attacks Affected. Attack rolls against you have Disadvantage, and your attack rolls have Advantage. If a creature can somehow see you, you don't gain this benefit against that creature.
	*/
	[EConditionName.INVISIBLE]: {
		name: EConditionName.INVISIBLE,
		modifyOutgoingAttack: () => ({
			hasAdvantage: true,
		}),
		modifyIncomingAttack: () => ({
			hasDisadvantage: true,
		}),
	},
	/*
	While you have the Incapacitated condition, you experience the following effects.
	- Inactive. You can't take any action, Bonus Action, or Reaction.
	- No Concentration. Your Concentration is broken.
	- Speechless. You can't speak.
	- Surprised. If you're Incapacitated when you roll Initiative, you have Disadvantage on the roll.
	*/
	[EConditionName.INCAPACITATED]: {
		name: EConditionName.INCAPACITATED,
		canAct: () => false,
	},
	/*
	While you have the Exhaustion condition, you experience the following effects.
	- Exhaustion Levels. This condition is cumulative. Each time you receive it, you gain 1 Exhaustion level. You die if your Exhaustion level is 6.
	- D20 Tests Affected. When you make a D20 Test the roll is reduced by 2 times your Exhaustion level.
	- Speed Reduced. Your Speed is reduced by a number of feet equal to 5 times your Exhaustion level.
	- Removing Exhaustion Levels. Finishing a Long Rest removes 1 of your Exhaustion levels. When your Exhaustion level reaches 0, the condition ends.
	*/
	[EConditionName.EXHAUSTION]: {
		name: EConditionName.EXHAUSTION,
		modifyOutgoingAttack: (ctx) => {
			const exhaustionLevel = ctx.attacker.getCondition(EConditionName.EXHAUSTION)?.level ?? 1;

			return {
				hasHitModifier: true,
				hitModifierFunction: () => -2 * exhaustionLevel,
			};
		},
	},
	/*
	While you have the Grappled condition, you experience the following effects.
	- Speed 0. Your Speed is 0 and can't increase.
	- Attacks Affected. You have Disadvantage on attack rolls against any target other than the grappler.
	- Movable. The grappler can drag or carry you when it moves, but every foot of movement costs it 1 extra foot unless you are Tiny or two or more sizes smaller than it.
	*/
	[EConditionName.GRAPPLED]: {
		name: EConditionName.GRAPPLED,
		modifyOutgoingAttack: () => ({
			hasDisadvantage: true, // TODO: against any target other than the grappler
		}),
	},
};
