import type { TStatBlock } from "../character/BaseCharacter.ts";
import type { LegalCharacterBuild } from "../character/CharacterBuild.ts";
import type { CombatantOptions } from "../character/CombatantData.ts";
import type { AttackMode, AttackResult, CreatureSize, UnarmedEffectResult } from "../combat/CombatTypes.ts";
import type { InitiativeOptions, InitiativeResult } from "../combat/EncounterScheduler.ts";
import type { CombatStrategy } from "../combat/Strategy.ts";
import type { DiceRoller } from "../dice/RandomSource.ts";
import type { TConditionState } from "../modifiers/Conditions.ts";
import type { Estimate } from "./Statistics.ts";

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type DprTarget = {
	id: string;
	name?: string;
	armorClass: number;
	hitPoints: { mode: "finite"; maximum: number } | { mode: "inexhaustible" };
	distanceToActor: number;
	speed?: number;
	size?: CreatureSize;
	stats?: TStatBlock;
	combatOptions?: CombatantOptions;
	conditions?: readonly TConditionState[];
};
export type DprEpisode = {
	id: string;
	rounds?: number;
	targets: readonly DprTarget[];
	/** Explicit static geometry. Missing pairs cannot authorize Cleave. */
	targetDistances?: readonly { firstId: string; secondId: string; feet: number }[];
	cleaveProbability?: number;
	initiative?: InitiativeOptions;
	attack?: { kind: "weapon"; mode?: AttackMode } | { kind: "unarmed" };
	/** Allows strategy-selected Grapple/Shove replacements; default false. */
	allowUnarmedEffects?: boolean;
};
export type DprTransition = {
	afterEpisodeId: string;
	elapsedMinutes: number;
	rest?: "short-rest" | "long-rest";
};
export type DprScenario = {
	id: string;
	/** This static DPR mode models bright light only. Other lighting is rejected. */
	lighting?: "bright";
	/** Declares a completed rest before the first episode; no rest is inferred from a fresh state. */
	initialRecovery?: "short-rest" | "long-rest";
	episodes: readonly DprEpisode[];
	transitions?: readonly DprTransition[];
};
export type DprExperiment = {
	rootSeed: number;
	rulesetId: "phb-2024";
	codeVersion: string;
	buildId: string;
	buildFactory: () => LegalCharacterBuild;
	strategyId: string;
	strategyParameters: JsonValue;
	strategyFactory: () => Partial<CombatStrategy>;
	/** Explicitly requested unsupported benefits are errors, never zero damage. */
	requestedBenefits?: readonly string[];
	scenario: DprScenario;
};
export type ResourceCounts = Readonly<Record<string, number>>;
export type ResourceCost = Readonly<Record<string, number>>;
export type ActorHealth = { readonly hitPoints: number; readonly temporaryHitPoints: number };
export type DprEpisodeResult = {
	id: string;
	plannedRounds: number;
	appliedDamage: number;
	hitPointsLost: number;
	temporaryHitPointsLost: number;
	overkill: number;
	dpr: number;
	damageByRound: readonly number[];
	initialResources: ResourceCounts;
	finalResources: ResourceCounts;
	initialActorHealth: ActorHealth;
	finalActorHealth: ActorHealth;
	resourceCost: ResourceCost;
	weaponInstancesSpent: number;
	initialSpentWeaponInstanceIds: readonly string[];
	finalSpentWeaponInstanceIds: readonly string[];
	initiative: readonly InitiativeResult[];
	seeds: { combat: number; environment: number };
	limitations: readonly string[];
	/** Retaining trees is opt-in; metrics use the damage ledger instead of summing trees. */
	attacks?: readonly AttackResult[];
	/** Save-based replacements are distinct from attack-roll/damage results. */
	unarmedEffects?: readonly UnarmedEffectResult[];
};
export type DprTransitionResult = {
	afterEpisodeId: string;
	elapsedMinutes: number;
	rest?: "short-rest" | "long-rest";
	beforeResources: ResourceCounts;
	afterResources: ResourceCounts;
	beforeActorHealth: ActorHealth;
	afterActorHealth: ActorHealth;
};
export type DprMetadata = {
	rulesetId: string;
	rulesVersion: string;
	codeVersion: string;
	buildId: string;
	build: JsonValue;
	buildSupport: JsonValue;
	strategyId: string;
	strategyParameters: JsonValue;
	scenario: JsonValue;
	randomness: {
		rootSeed: number;
		seedDerivation: string;
		combatAlgorithm: string;
		combatParameters?: JsonValue;
		environmentAlgorithm: string;
	};
	metric: "post-defense-damage-per-planned-combat-round";
	targetBehavior: "passive-stand-on-own-turn";
	actorHealthPolicy: "carry-across-episodes-long-rest-restores";
};
export type DprTrialResult = {
	metadata: DprMetadata;
	trialIndex: number;
	trialSeed: number;
	plannedRounds: number;
	appliedDamage: number;
	hitPointsLost: number;
	temporaryHitPointsLost: number;
	overkill: number;
	dpr: number;
	resourceCost: ResourceCost;
	weaponInstancesSpent: number;
	episodes: readonly DprEpisodeResult[];
	transitions: readonly DprTransitionResult[];
	initialRecovery?: {
		event: "short-rest" | "long-rest";
		beforeResources: ResourceCounts;
		afterResources: ResourceCounts;
		beforeActorHealth: ActorHealth;
		afterActorHealth: ActorHealth;
	};
};
export type DprTrialOptions = {
	trialIndex?: number;
	retainAttacks?: boolean;
	/** Test/scenario injection must identify the actual RNG algorithm in metadata. */
	combatRandomness?: {
		algorithm: string;
		parameters: JsonValue;
		createRoller: (seed: number, episodeId: string) => DiceRoller;
	};
};
export type DprBatchOptions = { trials?: number; startTrialIndex?: number; retainTrials?: boolean };
export type DprAggregate = {
	appliedDamage: Estimate;
	hitPointsLost: Estimate;
	overkill: Estimate;
	dpr: Estimate;
	resourceCost: Readonly<Record<string, Estimate>>;
	weaponInstancesSpent: Estimate;
};
export type DprBatchResult = {
	metadata: DprMetadata;
	trialCount: number;
	startTrialIndex: number;
	trialSeeds: readonly { trialIndex: number; seed: number }[];
	aggregate: DprAggregate;
	episodes: readonly ({ id: string } & DprAggregate)[];
	trials?: readonly DprTrialResult[];
};
