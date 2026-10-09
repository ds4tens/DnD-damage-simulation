import {
	assertLegalCharacterBuild,
	assessBuildSupport,
	combatantInputForBuild,
	type LegalCharacterBuild,
} from "../character/CharacterBuild.ts";
import { CombatEngine } from "../combat/AttackResolver.ts";
import type { AttackResult, CombatantInput, UnarmedEffectResult } from "../combat/CombatTypes.ts";
import { EncounterState } from "../combat/EncounterState.ts";
import { freezeSnapshot } from "../combat/Strategy.ts";
import { SeededDiceRoller } from "../dice/RandomSource.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { carryActorToNextEpisode } from "./ActorCarry.ts";
import { aggregateDprTrials } from "./Aggregation.ts";
import { collectDamageMetrics } from "./AttackMetrics.ts";
import {
	createEpisodeCleaveProvider,
	defaultCombatRounds,
	defaultTrials,
	dprActorId,
	staticDistance,
	validateScenario,
} from "./Scenario.ts";
import { combatRngAlgorithm, deriveSeed, type SeedIdentity, seedDerivationVersion } from "./Seed.ts";
import { canonicalJson, toJson } from "./Serialization.ts";
import type {
	ActorHealth,
	DprBatchOptions,
	DprBatchResult,
	DprEpisodeResult,
	DprExperiment,
	DprMetadata,
	DprTarget,
	DprTransitionResult,
	DprTrialOptions,
	DprTrialResult,
	ResourceCounts,
} from "./SimulationTypes.ts";

function targetInput(target: DprTarget): CombatantInput {
	const definition = new BaseMonster(
		target.name ?? target.id,
		target.armorClass,
		target.hitPoints.mode === "finite" ? target.hitPoints.maximum : 1,
		target.speed ?? 30,
		{ ...target.combatOptions, ...(target.stats ? { stats: target.stats } : {}) },
	);
	definition.conditions = structuredClone([...(target.conditions ?? [])]);
	return {
		id: target.id,
		definition,
		hitPointMode: target.hitPoints.mode,
		...(target.size ? { size: target.size } : {}),
	};
}

function resourceDifference(before: ResourceCounts, after: ResourceCounts): Record<string, number> {
	const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
	return Object.fromEntries([...ids].sort().map((id) => [id, (after[id] ?? 0) - (before[id] ?? 0)]));
}

function actorHealth(encounter: EncounterState): ActorHealth {
	const state = encounter.state(dprActorId);
	return { hitPoints: state.hitPoints, temporaryHitPoints: state.temporaryHp };
}

function prepare(source: DprExperiment): {
	experiment: DprExperiment;
	build: LegalCharacterBuild;
	metadata: DprMetadata;
} {
	const experiment = freezeSnapshot({
		...source,
		scenario: structuredClone(source.scenario),
		strategyParameters: toJson(source.strategyParameters),
		...(source.requestedBenefits ? { requestedBenefits: [...source.requestedBenefits] } : {}),
	});
	validateScenario(experiment.scenario);
	// Validate every target now, including episodes reached only late in the day.
	for (const episode of experiment.scenario.episodes) for (const target of episode.targets) targetInput(target);
	deriveSeed({ ...experiment, scenarioId: experiment.scenario.id, trialIndex: 0 }, "validate");
	const build = experiment.buildFactory();
	assertLegalCharacterBuild(build);
	if (experiment.rulesetId !== build.selection.ruleset)
		throw new Error("Simulation ruleset must match the legal build");
	const supportContext = {
		...(experiment.requestedBenefits ? { requestedBenefits: experiment.requestedBenefits } : {}),
		lighting: experiment.scenario.lighting ?? "bright",
		targetConditions: [
			...new Set(
				experiment.scenario.episodes.flatMap((episode) =>
					episode.targets.flatMap((target) => (target.conditions ?? []).map((condition) => condition.name)),
				),
			),
		],
	};
	const support = assessBuildSupport(build, supportContext);
	const metadata: DprMetadata = {
		rulesetId: experiment.rulesetId,
		rulesVersion: build.rulesVersion,
		codeVersion: experiment.codeVersion,
		buildId: experiment.buildId,
		build: toJson(build.selection),
		buildSupport: toJson(support),
		strategyId: experiment.strategyId,
		strategyParameters: toJson(experiment.strategyParameters),
		scenario: toJson({
			...experiment.scenario,
			lighting: experiment.scenario.lighting ?? "bright",
			episodes: experiment.scenario.episodes.map((episode) => ({
				...episode,
				rounds: episode.rounds ?? defaultCombatRounds,
				cleaveProbability: episode.cleaveProbability ?? 1,
				attack: episode.attack ?? { kind: "weapon" },
				allowUnarmedEffects: episode.allowUnarmedEffects ?? false,
			})),
		}),
		randomness: {
			rootSeed: experiment.rootSeed,
			seedDerivation: seedDerivationVersion,
			combatAlgorithm: combatRngAlgorithm,
			environmentAlgorithm: combatRngAlgorithm,
		},
		metric: "post-defense-damage-per-planned-combat-round",
		targetBehavior: "passive-stand-on-own-turn",
		actorHealthPolicy: "carry-across-episodes-long-rest-restores",
	};
	return { experiment, build, metadata };
}

function runPreparedTrial(
	experiment: DprExperiment,
	metadata: DprMetadata,
	build: LegalCharacterBuild,
	options: DprTrialOptions,
	seenStrategies?: WeakSet<object>,
): DprTrialResult {
	assertLegalCharacterBuild(build);
	if (build.rulesVersion !== metadata.rulesVersion || canonicalJson(build.selection) !== canonicalJson(metadata.build))
		throw new Error("Build factory must reproduce the same legal build for every trial");
	const trialIndex = options.trialIndex ?? 0;
	const identity: SeedIdentity = {
		rootSeed: experiment.rootSeed,
		rulesetId: experiment.rulesetId,
		codeVersion: experiment.codeVersion,
		buildId: experiment.buildId,
		strategyId: experiment.strategyId,
		scenarioId: experiment.scenario.id,
		trialIndex,
	};
	const trialSeed = deriveSeed(identity, "trial");
	const strategy = experiment.strategyFactory();
	if (typeof strategy !== "object" || strategy === null)
		throw new Error("Strategy factory must return a fresh strategy");
	if (seenStrategies?.has(strategy)) throw new Error("Strategy factory reused an instance between independent trials");
	seenStrategies?.add(strategy);
	if (options.combatRandomness && !options.combatRandomness.algorithm.trim())
		throw new Error("Injected combat randomness requires an algorithm label");
	const actualMetadata = structuredClone(metadata);
	if (options.combatRandomness) {
		actualMetadata.randomness.combatAlgorithm = options.combatRandomness.algorithm;
		actualMetadata.randomness.combatParameters = toJson(options.combatRandomness.parameters);
	}
	let actor = combatantInputForBuild(build, dprActorId);
	const episodes: DprEpisodeResult[] = [];
	const transitions: DprTransitionResult[] = [];
	let initialRecovery: DprTrialResult["initialRecovery"];
	for (let episodeIndex = 0; episodeIndex < experiment.scenario.episodes.length; episodeIndex++) {
		const episode = experiment.scenario.episodes[episodeIndex];
		if (!episode) throw new Error("Missing scheduled episode");
		const combatSeed = deriveSeed(identity, `combat:${episode.id}`);
		const environmentSeed = deriveSeed(identity, `environment:${episode.id}`);
		const roller = options.combatRandomness?.createRoller(combatSeed, episode.id) ?? new SeededDiceRoller(combatSeed);
		const environment = new SeededDiceRoller(environmentSeed);
		const targetIds = new Set(episode.targets.map((target) => target.id));
		const encounter = new EncounterState([actor, ...episode.targets.map(targetInput)]);
		const engine = new CombatEngine(encounter, {
			roller,
			strategy,
			distanceFor: (firstId, secondId) => staticDistance(episode, firstId, secondId),
			cleaveCandidates: createEpisodeCleaveProvider(episode, encounter, environment),
		});
		if (episodeIndex === 0 && experiment.scenario.initialRecovery) {
			const beforeResources = encounter.resourceSnapshot(dprActorId);
			const beforeActorHealth = actorHealth(encounter);
			engine.completeRest(dprActorId, experiment.scenario.initialRecovery);
			initialRecovery = {
				event: experiment.scenario.initialRecovery,
				beforeResources,
				afterResources: encounter.resourceSnapshot(dprActorId),
				beforeActorHealth,
				afterActorHealth: actorHealth(encounter),
			};
		}
		const initialResources = encounter.resourceSnapshot(dprActorId);
		const initialActorHealth = actorHealth(encounter);
		const spentBefore = encounter.resourceSpentSnapshot(dprActorId);
		const initialSpentWeaponInstanceIds = [...encounter.state(dprActorId).spentWeaponInstanceIds];
		const scheduler = engine.createScheduler(episode.initiative ?? {});
		const plannedRounds = episode.rounds ?? defaultCombatRounds;
		const damageByRound = Array<number>(plannedRounds).fill(0);
		const attacks: AttackResult[] = [];
		const unarmedEffects: UnarmedEffectResult[] = [];
		const limitations = new Set(build.report.limitations.map((benefit) => `${benefit.id} (${benefit.domain})`));
		while (scheduler.roundNumber <= plannedRounds) {
			const roundIndex = scheduler.roundNumber - 1;
			const actorId = scheduler.nextActorId;
			const eventOffset = engine.damageEvents.length;
			scheduler.beginNextTurn();
			if (actorId === dprActorId) {
				const hasLivingTarget = episode.targets.some((target) => encounter.state(target.id).lifeState !== "dead");
				if (hasLivingTarget) {
					for (const feature of engine.resolveFeatureActions(dprActorId, "before-attack"))
						attacks.push(...feature.attacks);
					const attackOptions = {
						unarmedEffects: episode.allowUnarmedEffects ?? false,
						...(episode.attack?.kind === "unarmed"
							? { unarmed: true }
							: episode.attack?.mode
								? { mode: episode.attack.mode }
								: {}),
					};
					const target = episode.targets.find(
						(candidate) =>
							encounter.state(candidate.id).lifeState !== "dead" &&
							(engine.legalAttackCandidates(dprActorId, candidate.id, attackOptions).length > 0 ||
								(attackOptions.unarmedEffects &&
									engine.legalUnarmedEffectCandidates(dprActorId, candidate.id).length > 0)),
					);
					if (target && encounter.canUseAction(dprActorId)) {
						const result = engine.resolveAttackAction(dprActorId, target.id, attackOptions);
						attacks.push(...result.attacks);
						unarmedEffects.push(...(result.unarmedEffects ?? []));
					}
					for (const feature of engine.resolveFeatureActions(dprActorId, "after-attack"))
						attacks.push(...feature.attacks);
				}
			} else engine.standUp(actorId);
			scheduler.endTurn();
			const metrics = collectDamageMetrics(engine.damageEvents.slice(eventOffset), dprActorId, targetIds);
			damageByRound[roundIndex] = (damageByRound[roundIndex] ?? 0) + metrics.appliedDamage;
		}
		const metrics = collectDamageMetrics(engine.damageEvents, dprActorId, targetIds);
		const collectLimitations = (attack: AttackResult): void => {
			for (const limitation of attack.limitations) limitations.add(limitation);
			for (const child of attack.triggeredAttacks) collectLimitations(child);
		};
		for (const attack of attacks) collectLimitations(attack);
		const finalResources = encounter.resourceSnapshot(dprActorId);
		const finalSpentWeaponInstanceIds = [...encounter.state(dprActorId).spentWeaponInstanceIds];
		episodes.push({
			id: episode.id,
			plannedRounds,
			...metrics,
			dpr: metrics.appliedDamage / plannedRounds,
			damageByRound,
			initialResources,
			finalResources,
			initialActorHealth,
			finalActorHealth: actorHealth(encounter),
			resourceCost: resourceDifference(spentBefore, encounter.resourceSpentSnapshot(dprActorId)),
			weaponInstancesSpent: finalSpentWeaponInstanceIds.length - initialSpentWeaponInstanceIds.length,
			initialSpentWeaponInstanceIds,
			finalSpentWeaponInstanceIds,
			initiative: scheduler.initiative,
			seeds: { combat: combatSeed, environment: environmentSeed },
			limitations: [...limitations].sort(),
			...(options.retainAttacks ? { attacks, unarmedEffects } : {}),
		});
		const transition = experiment.scenario.transitions?.[episodeIndex];
		if (transition) {
			const beforeResources = encounter.resourceSnapshot(dprActorId);
			const beforeActorHealth = actorHealth(encounter);
			engine.advanceElapsedTime(transition.elapsedMinutes);
			if (transition.rest) engine.completeRest(dprActorId, transition.rest);
			transitions.push({
				...transition,
				beforeResources,
				afterResources: encounter.resourceSnapshot(dprActorId),
				beforeActorHealth,
				afterActorHealth: actorHealth(encounter),
			});
		}
		actor = carryActorToNextEpisode(build, engine);
	}
	const plannedRounds = episodes.reduce((sum, episode) => sum + episode.plannedRounds, 0);
	const appliedDamage = episodes.reduce((sum, episode) => sum + episode.appliedDamage, 0);
	const resourceIds = [...new Set(episodes.flatMap((episode) => Object.keys(episode.resourceCost)))].sort();
	return freezeSnapshot({
		metadata: actualMetadata,
		trialIndex,
		trialSeed,
		plannedRounds,
		appliedDamage,
		hitPointsLost: episodes.reduce((sum, episode) => sum + episode.hitPointsLost, 0),
		temporaryHitPointsLost: episodes.reduce((sum, episode) => sum + episode.temporaryHitPointsLost, 0),
		overkill: episodes.reduce((sum, episode) => sum + episode.overkill, 0),
		dpr: appliedDamage / plannedRounds,
		resourceCost: Object.fromEntries(
			resourceIds.map((id) => [id, episodes.reduce((sum, episode) => sum + (episode.resourceCost[id] ?? 0), 0)]),
		),
		weaponInstancesSpent: episodes.reduce((sum, episode) => sum + episode.weaponInstancesSpent, 0),
		episodes,
		transitions,
		...(initialRecovery ? { initialRecovery } : {}),
	});
}

export function runDprTrial(experiment: DprExperiment, options: DprTrialOptions = {}): DprTrialResult {
	const prepared = prepare(experiment);
	return runPreparedTrial(prepared.experiment, prepared.metadata, prepared.build, options);
}

export function runDprBatch(experiment: DprExperiment, options: DprBatchOptions = {}): DprBatchResult {
	const trials = options.trials ?? defaultTrials;
	const startTrialIndex = options.startTrialIndex ?? 0;
	if (
		!Number.isSafeInteger(trials) ||
		trials < 1 ||
		!Number.isSafeInteger(startTrialIndex) ||
		startTrialIndex < 0 ||
		!Number.isSafeInteger(startTrialIndex + trials - 1)
	)
		throw new Error("Invalid trial count or index range");
	const prepared = prepare(experiment);
	const results: DprTrialResult[] = [];
	const seenStrategies = new WeakSet<object>();
	for (let offset = 0; offset < trials; offset++) {
		const build = offset === 0 ? prepared.build : prepared.experiment.buildFactory();
		results.push(
			runPreparedTrial(
				prepared.experiment,
				prepared.metadata,
				build,
				{ trialIndex: startTrialIndex + offset },
				seenStrategies,
			),
		);
	}
	return freezeSnapshot(aggregateDprTrials(results, options.retainTrials ?? false));
}
