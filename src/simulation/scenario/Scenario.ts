import type { CleaveCandidate } from "../../combat/CombatTypes.ts";
import type { EncounterState } from "../../combat/state/EncounterState.ts";
import type { DiceRoller } from "../../dice/RandomSource.ts";
import { conditionRegistry } from "../../modifiers/Conditions.ts";
import type { DprEpisode, DprScenario } from "../SimulationTypes.ts";

export const dprActorId = "hero";
export const defaultCombatRounds = 3;
export const defaultTrials = 10_000;

function distance(value: number): void {
	if (!Number.isFinite(value) || value < 0) throw new Error("Static distances must be finite and nonnegative");
}

function staticEnvironment(value: object): void {
	const lighting: unknown = Reflect.get(value, "lighting");
	if (lighting !== undefined && lighting !== "bright")
		throw new Error("Static DPR scenarios support bright lighting only");
	if (Object.hasOwn(value, "cover"))
		throw new Error("Cover is outside the static DPR scenario; target AC excludes Cover");
}

function validateTargetConditions(conditions: unknown): void {
	if (conditions === undefined) return;
	if (!Array.isArray(conditions)) throw new Error("Target conditions must be an array");
	for (const condition of conditions) {
		if (typeof condition !== "object" || condition === null) throw new Error("Invalid target condition");
		const name: unknown = Reflect.get(condition, "name");
		if (typeof name !== "string" || !Object.hasOwn(conditionRegistry, name))
			throw new Error(`Unsupported target condition: ${String(name)}`);
	}
}

export function validateScenario(scenario: DprScenario): void {
	staticEnvironment(scenario);
	if (!scenario.id.trim() || scenario.episodes.length === 0) throw new Error("A scenario requires an ID and episodes");
	if (scenario.initialRecovery !== undefined && !["short-rest", "long-rest"].includes(scenario.initialRecovery))
		throw new Error("Invalid initial recovery event");
	const episodeIds = scenario.episodes.map((episode) => episode.id);
	if (episodeIds.some((id) => !id.trim()) || new Set(episodeIds).size !== episodeIds.length)
		throw new Error("Episode IDs must be distinct and nonempty");
	for (const episode of scenario.episodes) {
		staticEnvironment(episode);
		if (episode.allowUnarmedEffects !== undefined && typeof episode.allowUnarmedEffects !== "boolean")
			throw new Error("Unarmed effect policy must be boolean");
		if (episode.attack !== undefined) {
			if (episode.attack.kind !== "weapon" && episode.attack.kind !== "unarmed") throw new Error("Invalid attack kind");
			if (
				episode.attack.kind === "weapon" &&
				episode.attack.mode !== undefined &&
				!["melee", "ranged", "thrown"].includes(episode.attack.mode)
			)
				throw new Error("Invalid weapon attack mode");
			if (episode.attack.kind === "unarmed" && Object.hasOwn(episode.attack, "mode"))
				throw new Error("Unarmed attacks have no weapon mode");
		}
		const rounds = episode.rounds ?? defaultCombatRounds;
		if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error("A combat horizon must contain positive rounds");
		const ids = episode.targets.map((target) => target.id);
		if (ids.length === 0 || new Set(ids).size !== ids.length || ids.some((id) => !id.trim() || id === dprActorId))
			throw new Error("Each episode requires distinct targets, excluding the reserved hero ID");
		for (const target of episode.targets) {
			staticEnvironment(target);
			validateTargetConditions(target.conditions);
			if (target.combatOptions) staticEnvironment(target.combatOptions);
			if (!Number.isSafeInteger(target.armorClass) || target.armorClass < 0) throw new Error("Invalid target AC");
			distance(target.distanceToActor);
			if (target.speed !== undefined) distance(target.speed);
			if (target.hitPoints.mode === "finite") {
				if (!Number.isSafeInteger(target.hitPoints.maximum) || target.hitPoints.maximum < 1)
					throw new Error("Finite targets require positive integer HP");
			} else if (target.hitPoints.mode !== "inexhaustible") throw new Error("Invalid HP policy");
		}
		const pairKeys = new Set<string>();
		for (const pair of episode.targetDistances ?? []) {
			if (!ids.includes(pair.firstId) || !ids.includes(pair.secondId) || pair.firstId === pair.secondId)
				throw new Error("Target distance requires two distinct existing targets");
			const key = JSON.stringify([pair.firstId, pair.secondId].sort());
			if (pairKeys.has(key)) throw new Error("Static target distances cannot repeat a pair");
			pairKeys.add(key);
			distance(pair.feet);
		}
		const probability = episode.cleaveProbability ?? 1;
		if (!Number.isFinite(probability) || probability < 0 || probability > 1)
			throw new Error("Invalid Cleave probability");
		for (const order of [episode.initiative?.order, episode.initiative?.tieOrder]) {
			if (
				order &&
				(order.length !== ids.length + 1 ||
					new Set(order).size !== order.length ||
					order.some((id) => id !== dprActorId && !ids.includes(id)))
			)
				throw new Error("Initiative order must contain hero and every target exactly once");
		}
	}
	const transitions = scenario.transitions ?? [];
	if (transitions.length !== scenario.episodes.length - 1)
		throw new Error("Each adjacent pair of day episodes requires one explicit elapsed gap");
	for (let index = 0; index < transitions.length; index++) {
		const transition = transitions[index];
		if (!transition || transition.afterEpisodeId !== episodeIds[index])
			throw new Error("Transitions must follow the episode schedule");
		if (!Number.isFinite(transition.elapsedMinutes) || transition.elapsedMinutes < 10)
			throw new Error("Episode gaps must be at least ten minutes");
		if (transition.rest !== undefined && !["short-rest", "long-rest"].includes(transition.rest))
			throw new Error("Invalid recovery event");
		// A recovery event declares a completed rest. This runner does not simulate
		// rest duration/interruptions (including species-specific rest durations).
	}
}

export function staticDistance(episode: DprEpisode, firstId: string, secondId: string): number | undefined {
	if (firstId === secondId) return 0;
	if (firstId === dprActorId || secondId === dprActorId)
		return episode.targets.find((target) => target.id === (firstId === dprActorId ? secondId : firstId))
			?.distanceToActor;
	return episode.targetDistances?.find(
		(pair) =>
			(pair.firstId === firstId && pair.secondId === secondId) ||
			(pair.firstId === secondId && pair.secondId === firstId),
	)?.feet;
}

/** Geometry is fixed; one environment sample is cached per actor/global turn after an eligible hit. */
export function createEpisodeCleaveProvider(episode: DprEpisode, encounter: EncounterState, environment: DiceRoller) {
	const cached = new Map<string, boolean>();
	return (actorId: string, primaryTargetId: string, turnId: number): readonly CleaveCandidate[] => {
		const candidates = episode.targets.flatMap((target): CleaveCandidate[] => {
			if (target.id === primaryTargetId || encounter.state(target.id).lifeState === "dead") return [];
			const primaryDistance = staticDistance(episode, primaryTargetId, target.id);
			// Actual attack reach is a rules decision (e.g. Reach/Battering Roots), not scenario geometry.
			if (primaryDistance === undefined || primaryDistance > 5) return [];
			return [{ targetId: target.id, distanceToActor: target.distanceToActor, distanceToPrimary: primaryDistance }];
		});
		if (candidates.length === 0) return [];
		const key = JSON.stringify([actorId, turnId]);
		let available = cached.get(key);
		if (available === undefined) {
			const probability = episode.cleaveProbability ?? 1;
			available =
				probability === 1 || (probability !== 0 && (environment.roll(0x100000000) - 1) / 0x100000000 < probability);
			cached.set(key, available);
		}
		return available ? candidates : [];
	};
}
