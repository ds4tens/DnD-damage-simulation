import assert from "node:assert/strict";
import test from "node:test";
import { buildLegalCharacter, type CharacterBuildSelection } from "../../../src/character/build/CharacterBuild.ts";
import type { CombatStrategy } from "../../../src/combat/Strategy.ts";
import { FixedDiceRoller } from "../../../src/dice/RandomSource.ts";
import { runDprTrial } from "../../../src/simulation/runtime/DprSimulation.ts";
import type { DprEpisode, DprExperiment, DprScenario } from "../../../src/simulation/SimulationTypes.ts";

function selection(level = 1) {
	return {
		ruleset: "phb-2024",
		className: "barbarian",
		level,
		...(level >= 3 ? { subclass: "berserker", primalKnowledgeSkill: "perception" } : {}),
		pointBuy: { strength: 15, dexterity: 14, constitution: 13, intelligence: 8, wisdom: 12, charisma: 10 },
		background: {
			id: "soldier",
			abilityScoreIncreases: [
				{ abilityScore: "strength", amount: 1 },
				{ abilityScore: "constitution", amount: 2 },
			],
			toolChoice: "dice-set",
		},
		species: { id: "dwarf" },
		classSkills: ["nature", "survival"],
		progression: [],
		equipment: {
			armorId: "none",
			shield: false,
			weapons: [{ id: "mace", weaponId: "mace" }],
			hands: { left: "mace", right: null },
		},
		masteredWeaponIds: [],
	} satisfies CharacterBuildSelection;
}

function input(
	build: CharacterBuildSelection,
	scenario: DprScenario,
	strategy: Partial<CombatStrategy> = {},
): DprExperiment {
	return {
		rootSeed: 2024,
		rulesetId: "phb-2024",
		codeVersion: "interaction-test-v1",
		buildId: "interaction-fixture",
		buildFactory: () => buildLegalCharacter(build),
		strategyId: "explicit-optional-choices",
		strategyParameters: null,
		strategyFactory: () => ({
			useFeature: () => false,
			useOptionalFeature: () => false,
			chooseFeatureAction: () => null,
			chooseHewTarget: () => null,
			...strategy,
		}),
		scenario,
	};
}

function fixed(values: Readonly<Record<string, readonly number[]>>) {
	return {
		combatRandomness: {
			algorithm: "episode-fixed-sequences",
			parameters: { values },
			createRoller: (_seed: number, episodeId: string) => new FixedDiceRoller(values[episodeId] ?? []),
		},
		retainAttacks: true,
	};
}

function passive(id: string, rounds = 1): DprEpisode {
	return {
		id,
		rounds,
		targets: [{ id: "target", armorClass: 15, hitPoints: { mode: "inexhaustible" }, distanceToActor: 5 }],
		initiative: { order: ["hero", "target"] },
	};
}

test("DPR day carries exhausted ammunition through Short and Long Rest without replenishment", () => {
	const base = selection();
	const build: CharacterBuildSelection = {
		...base,
		equipment: {
			...base.equipment,
			weapons: [{ id: "bow", weaponId: "longbow" }],
			hands: { left: "bow", right: "bow" },
		},
		stock: { ammunition: { arrow: 1 } },
	};
	const ranged = (id: string): DprEpisode => ({
		...passive(id),
		targets: passive(id).targets.map((target) => ({ ...target, distanceToActor: 30 })),
		attack: { kind: "weapon", mode: "ranged" },
	});
	const result = runDprTrial(
		input(build, {
			id: "one-arrow-day",
			episodes: [ranged("first"), ranged("second"), ranged("third")],
			transitions: [
				{ afterEpisodeId: "first", elapsedMinutes: 60, rest: "short-rest" },
				{ afterEpisodeId: "second", elapsedMinutes: 480, rest: "long-rest" },
			],
		}),
		fixed({ first: [11, 6] }),
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.appliedDamage),
		[8, 0, 0],
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.initialResources["ammunition.arrow"]),
		[1, 0, 0],
	);
	assert.equal(result.resourceCost["ammunition.arrow"], 1);
	assert.equal(result.plannedRounds, 3);
	assert.equal(result.dpr, 8 / 3);
});

test("additional thrown stock supplies three physical daggers once per independent trial and never refills on rest", () => {
	const base = selection();
	const build: CharacterBuildSelection = {
		...base,
		equipment: {
			...base.equipment,
			weapons: [{ id: "dagger-1", weaponId: "dagger" }],
			hands: { left: "dagger-1", right: null },
		},
		stock: { thrownWeapons: { dagger: 2 } },
	};
	const thrown = (id: string, rounds: number): DprEpisode => ({
		...passive(id, rounds),
		targets: passive(id).targets.map((target) => ({ ...target, distanceToActor: 10 })),
		attack: { kind: "weapon", mode: "thrown" },
	});
	const experiment = input(
		build,
		{
			id: "three-daggers-rest-day",
			episodes: [thrown("first", 4), thrown("second", 2), thrown("third", 1)],
			transitions: [
				{ afterEpisodeId: "first", elapsedMinutes: 60, rest: "short-rest" },
				{ afterEpisodeId: "second", elapsedMinutes: 480, rest: "long-rest" },
			],
		},
		{
			// Decline the optional Light/Nick follow-up as well as class/feat
			// features, so this supply oracle spends one physical dagger per turn.
			chooseNextAttack: (_snapshot, candidates) => {
				const index = candidates.findIndex((candidate) => candidate.attackOrigin === "primary");
				return index < 0 ? null : index;
			},
		},
	);
	const rolls = fixed({ first: [10, 3, 10, 3, 10, 3] });
	const result = runDprTrial(experiment, rolls);
	assert.deepEqual(result.episodes[0]?.damageByRound, [6, 6, 6, 0]);
	assert.deepEqual(
		result.episodes.map((episode) => episode.appliedDamage),
		[18, 0, 0],
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.weaponInstancesSpent),
		[3, 0, 0],
	);
	const first = result.episodes[0];
	assert.ok(first);
	assert.equal(first.attacks?.length, 3);
	assert.equal(first.finalSpentWeaponInstanceIds.length, 3);
	assert.equal(new Set(first.finalSpentWeaponInstanceIds).size, 3);
	assert.ok(first.finalSpentWeaponInstanceIds.includes("dagger-1"));
	assert.deepEqual(
		new Set(first.attacks?.map((attack) => attack.weaponInstanceId)),
		new Set(first.finalSpentWeaponInstanceIds),
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.initialSpentWeaponInstanceIds.length),
		[0, 3, 3],
	);
	assert.equal(result.weaponInstancesSpent, 3);
	assert.equal(result.appliedDamage, 18);
	assert.equal(result.plannedRounds, 7);
	assert.equal(result.dpr, 18 / 7);
	assert.deepEqual(build.stock?.thrownWeapons, { dagger: 2 });
	assert.equal(build.equipment.weapons.length, 1);
	// Replay is exact; another independent trial starts with the full initial
	// physical supply despite the preceding day's Short/Long Rest depletion.
	assert.deepEqual(runDprTrial(experiment, rolls), result);
	const fresh = runDprTrial(experiment, { ...rolls, trialIndex: 27 });
	assert.deepEqual(fresh.episodes[0]?.damageByRound, [6, 6, 6, 0]);
	assert.equal(fresh.episodes[0]?.initialSpentWeaponInstanceIds.length, 0);
	assert.deepEqual(fresh.episodes[0]?.finalSpentWeaponInstanceIds, first.finalSpentWeaponInstanceIds);
	assert.equal(fresh.appliedDamage, 18);
	assert.equal(fresh.weaponInstancesSpent, 3);
});

test("passive targets stand only with positive effective speed, preserving the attack advantage consequence", () => {
	const prone = (speed: number): DprEpisode => ({
		...passive("prone", 2),
		targets: passive("prone").targets.map((target) => ({ ...target, speed, conditions: [{ name: "prone" }] })),
	});
	const immobile = runDprTrial(
		input(selection(), { id: "immobile-prone", episodes: [prone(0)] }),
		fixed({ prone: [2, 18, 4, 2, 18, 4] }),
	);
	const mobile = runDprTrial(
		input(selection(), { id: "mobile-prone", episodes: [prone(30)] }),
		fixed({ prone: [2, 18, 4, 18, 4] }),
	);
	assert.deepEqual(
		immobile.episodes[0]?.attacks?.map((attack) => attack.hit.d20Rolls),
		[
			[2, 18],
			[2, 18],
		],
	);
	assert.deepEqual(
		mobile.episodes[0]?.attacks?.map((attack) => attack.hit.d20Rolls),
		[[2, 18], [18]],
	);
	assert.equal(immobile.appliedDamage, 14);
	assert.equal(mobile.appliedDamage, 14);
});

function greatWeaponBuild(): CharacterBuildSelection {
	const base = selection(4);
	return {
		...base,
		progression: [
			{
				level: 4,
				feat: { name: "great-weapon-master", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
			},
		],
		equipment: {
			...base.equipment,
			weapons: [{ id: "axe", weaponId: "greataxe" }],
			hands: { left: "axe", right: "axe" },
		},
		masteredWeaponIds: ["greataxe"],
	};
}
function cleaveEpisode(mode: "finite" | "inexhaustible"): DprEpisode {
	return {
		id: "cleave",
		rounds: 1,
		targets: [
			{
				id: "first",
				armorClass: 10,
				hitPoints: mode === "finite" ? { mode, maximum: 1 } : { mode },
				distanceToActor: 5,
			},
			{ id: "second", armorClass: 10, hitPoints: { mode: "inexhaustible" }, distanceToActor: 5 },
		],
		targetDistances: [{ firstId: "first", secondId: "second", feet: 5 }],
		initiative: { order: ["hero", "first", "second"] },
	};
}
const cleaveHewChoices: Partial<CombatStrategy> = {
	useFeature: (_snapshot, id) => id === "great-weapon-master.heavy-weapon-mastery" || id === "weaponMastery.cleave",
	chooseHewTarget: (_snapshot, targets) => targets.find((target) => target.hitPoints > 0)?.id ?? null,
};

test("Cleave and kill-triggered Hew contribute to canonical DPR exactly once", () => {
	const result = runDprTrial(
		input(greatWeaponBuild(), { id: "finite-cleave-hew", episodes: [cleaveEpisode("finite")] }, cleaveHewChoices),
		fixed({ cleave: [10, 4, 10, 5, 10, 6] }),
	);
	assert.equal(result.appliedDamage, 25);
	assert.equal(result.hitPointsLost, 1);
	assert.equal(result.overkill, 8);
	assert.equal(result.episodes[0]?.attacks?.length, 1);
	assert.equal(result.episodes[0]?.attacks?.[0]?.triggeredAttacks.length, 2);
	assert.deepEqual(result.episodes[0]?.damageByRound, [25]);
});

test("inexhaustible targets cannot offer Hew by a fake kill, while real criticals still can", () => {
	const scenario = { id: "inexhaustible-cleave-hew", episodes: [cleaveEpisode("inexhaustible")] };
	const ordinary = runDprTrial(
		input(greatWeaponBuild(), scenario, cleaveHewChoices),
		fixed({ cleave: [10, 4, 10, 5] }),
	);
	const critical = runDprTrial(
		input(greatWeaponBuild(), scenario, cleaveHewChoices),
		fixed({ cleave: [20, 2, 3, 10, 4, 10, 5] }),
	);
	assert.equal(ordinary.appliedDamage, 16);
	assert.equal(ordinary.episodes[0]?.attacks?.[0]?.triggeredAttacks.length, 1);
	assert.equal(critical.appliedDamage, 24);
	assert.equal(critical.episodes[0]?.attacks?.[0]?.triggeredAttacks.length, 2);
	assert.equal(ordinary.hitPointsLost + critical.hitPointsLost, 0);
	assert.equal(ordinary.overkill + critical.overkill, 0);
});

const rageChoices: Partial<CombatStrategy> = {
	useOptionalFeature: (_snapshot, id) => id === "barbarian.rage",
	chooseFeatureAction: (_snapshot, candidates) =>
		candidates.find((candidate) => candidate.id === "barbarian.rage.activate")?.id ?? null,
};

test("a day carries Rage expenditure and gaps end activation before the next episode", () => {
	const result = runDprTrial(
		input(
			selection(),
			{
				id: "rage-depletion-day",
				episodes: [passive("first"), passive("second"), passive("third")],
				transitions: [
					{ afterEpisodeId: "first", elapsedMinutes: 10 },
					{ afterEpisodeId: "second", elapsedMinutes: 10 },
				],
			},
			rageChoices,
		),
		fixed({ first: [10, 6], second: [10, 6], third: [10, 6] }),
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.appliedDamage),
		[11, 11, 9],
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.initialResources["barbarian.rage"]),
		[2, 1, 0],
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.resourceCost["barbarian.rage"] ?? 0),
		[1, 1, 0],
	);
	assert.equal(result.resourceCost["barbarian.rage"], 2);
	assert.equal(result.dpr, 31 / 3);
});

test("Short Rest returns one Rage and Long Rest restores all, with actual spending counted independently", () => {
	const result = runDprTrial(
		input(
			selection(),
			{
				id: "rage-rest-day",
				episodes: [passive("first"), passive("second"), passive("third")],
				transitions: [
					{ afterEpisodeId: "first", elapsedMinutes: 60, rest: "short-rest" },
					{ afterEpisodeId: "second", elapsedMinutes: 480, rest: "long-rest" },
				],
			},
			rageChoices,
		),
		fixed({ first: [10, 6], second: [10, 6], third: [10, 6] }),
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.appliedDamage),
		[11, 11, 11],
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.initialResources["barbarian.rage"]),
		[2, 2, 2],
	);
	assert.equal(result.resourceCost["barbarian.rage"], 3);
	assert.deepEqual(
		result.transitions.map((transition) => [
			transition.beforeResources["barbarian.rage"],
			transition.afterResources["barbarian.rage"],
		]),
		[
			[1, 2],
			[1, 2],
		],
	);
	assert.equal(result.plannedRounds, 3);
});

test("hostile attacks sustain one Rage throughout the fixed horizon without repeated resource cost", () => {
	const result = runDprTrial(
		input(selection(), { id: "rage-one-activation", episodes: [passive("first", 3)] }, rageChoices),
		fixed({ first: [10, 6, 10, 6, 10, 6] }),
	);
	assert.deepEqual(result.episodes[0]?.damageByRound, [11, 11, 11]);
	assert.equal(result.resourceCost["barbarian.rage"], 1);
});

test("Persistent Rage recovery follows genuine Initiative once per Long Rest across the day", () => {
	const build: CharacterBuildSelection = {
		...selection(15),
		progression: ([4, 8, 12] as const).map((level) => ({
			level,
			feat: {
				name: "ability-score-improvement",
				abilityScoreImprovement: [{ abilityScore: "intelligence", amount: 2 }],
			},
		})),
	};
	const rolled = (id: string): DprEpisode => ({ ...passive(id), initiative: {} });
	const result = runDprTrial(
		input(
			build,
			{
				id: "persistent-rage-day",
				episodes: [
					passive("first"),
					passive("second"),
					rolled("third"),
					rolled("fourth"),
					rolled("fifth"),
					rolled("sixth"),
				],
				transitions: [
					{ afterEpisodeId: "first", elapsedMinutes: 10 },
					{ afterEpisodeId: "second", elapsedMinutes: 10 },
					{ afterEpisodeId: "third", elapsedMinutes: 10 },
					{ afterEpisodeId: "fourth", elapsedMinutes: 480, rest: "long-rest" },
					{ afterEpisodeId: "fifth", elapsedMinutes: 10 },
				],
			},
			{
				...rageChoices,
				useOptionalFeature: (_snapshot, id) => id === "barbarian.rage" || id === "barbarian.persistent-rage",
			},
		),
		fixed({
			first: [10, 6, 10, 6],
			second: [10, 6, 10, 6],
			third: [10, 15, 1, 10, 6, 10, 6],
			fourth: [10, 15, 1, 10, 6, 10, 6],
			fifth: [10, 15, 1, 10, 6, 10, 6],
			sixth: [10, 15, 1, 10, 6, 10, 6],
		}),
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.initialResources["barbarian.rage"]),
		[5, 4, 3, 4, 5, 4],
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.finalResources["barbarian.rage"]),
		[4, 3, 4, 3, 4, 4],
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.resourceCost["barbarian.persistent-rage"] ?? 0),
		[0, 0, 1, 0, 0, 1],
	);
	assert.equal(result.resourceCost["barbarian.rage"], 6);
	assert.equal(result.resourceCost["barbarian.persistent-rage"], 2);
	assert.ok(result.episodes.slice(0, 2).every((episode) => episode.initiative.every((roll) => roll.natural === null)));
	assert.deepEqual(result.episodes[2]?.initiative.find((roll) => roll.actorId === "hero")?.d20Rolls, [10, 15]);
	assert.equal(result.dpr, 24);
});

test("Human Heroic Inspiration requires an explicit completed Long Rest and carries spent state", () => {
	const build: CharacterBuildSelection = {
		...selection(),
		species: { id: "human", skill: "insight" },
		humanOriginFeat: { name: "tough" },
	};
	const choices: Partial<CombatStrategy> = {
		useOptionalFeature: (_snapshot, id) => id === "heroic-inspiration",
		chooseFeatureOption: (_snapshot, id, candidates) =>
			id === "heroic-inspiration.die" ? "reroll" : (candidates[0] ?? null),
	};
	const beforeRest = runDprTrial(
		input(build, { id: "human-no-rest", episodes: [passive("first")] }, choices),
		fixed({ first: [1] }),
	);
	assert.equal(beforeRest.episodes[0]?.initialResources["heroic-inspiration"], 0);
	assert.equal(beforeRest.appliedDamage, 0);
	const result = runDprTrial(
		input(
			build,
			{
				id: "human-rest-day",
				initialRecovery: "long-rest",
				episodes: [passive("first"), passive("second"), passive("third")],
				transitions: [
					{ afterEpisodeId: "first", elapsedMinutes: 60, rest: "short-rest" },
					{ afterEpisodeId: "second", elapsedMinutes: 480, rest: "long-rest" },
				],
			},
			choices,
		),
		fixed({ first: [1, 10, 6], second: [1], third: [1, 10, 6] }),
	);
	assert.equal(result.initialRecovery?.beforeResources["heroic-inspiration"], 0);
	assert.equal(result.initialRecovery?.afterResources["heroic-inspiration"], 1);
	assert.deepEqual(
		result.episodes.map((episode) => episode.initialResources["heroic-inspiration"]),
		[1, 0, 1],
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.appliedDamage),
		[9, 0, 9],
	);
	assert.equal(result.resourceCost["heroic-inspiration"], 2);
});

test("Aasimar attack and end-turn damage count targets while self damage contributes no DPR", () => {
	const build: CharacterBuildSelection = { ...selection(3), species: { id: "aasimar" } };
	const result = runDprTrial(
		input(
			build,
			{ id: "aasimar-ledger", episodes: [passive("first")] },
			{
				useFeature: (_snapshot, id) => id === "aasimar.celestial-revelation.damage",
				useOptionalFeature: (_snapshot, id) => id === "aasimar.celestial-revelation",
				chooseFeatureAction: (_snapshot, candidates) =>
					candidates.find((candidate) => candidate.id === "species.aasimar.celestial-revelation.activate")?.id ?? null,
				chooseFeatureOption: (_snapshot, id, candidates) =>
					id === "aasimar.celestial-revelation.form" ? "inner-radiance" : (candidates[0] ?? null),
			},
		),
		fixed({ first: [10, 6] }),
	);
	assert.equal(result.appliedDamage, 13);
	assert.equal(result.hitPointsLost, 0);
	assert.deepEqual(result.episodes[0]?.damageByRound, [13]);
	assert.equal(result.resourceCost["species.aasimar.celestial-revelation"], 1);
});

test("Aasimar fixed horizon retains attack overkill and never deals later aura damage to a dead target", () => {
	const build: CharacterBuildSelection = { ...selection(3), species: { id: "aasimar" } };
	const result = runDprTrial(
		input(
			build,
			{
				id: "aasimar-finite-horizon",
				episodes: [
					{
						...passive("first", 3),
						targets: [{ id: "target", armorClass: 15, hitPoints: { mode: "finite", maximum: 1 }, distanceToActor: 5 }],
					},
				],
			},
			{
				useFeature: (_snapshot, id) => id === "aasimar.celestial-revelation.damage",
				useOptionalFeature: (_snapshot, id) => id === "aasimar.celestial-revelation",
				chooseFeatureAction: (_snapshot, candidates) =>
					candidates.find((candidate) => candidate.id === "species.aasimar.celestial-revelation.activate")?.id ?? null,
				chooseFeatureOption: (_snapshot, id, candidates) =>
					id === "aasimar.celestial-revelation.form" ? "inner-radiance" : (candidates[0] ?? null),
			},
		),
		fixed({ first: [10, 6] }),
	);
	assert.equal(result.appliedDamage, 11);
	assert.equal(result.hitPointsLost, 1);
	assert.equal(result.overkill, 10);
	assert.equal(result.dpr, 11 / 3);
	assert.deepEqual(result.episodes[0]?.damageByRound, [11, 0, 0]);
	assert.equal(result.episodes[0]?.attacks?.length, 1);
	assert.equal(result.episodes[0]?.initialActorHealth.hitPoints, 32);
	assert.equal(result.episodes[0]?.finalActorHealth.hitPoints, 29);
});

test("Poisoner separate save damage counts once and exhausted doses remain spent after Long Rest", () => {
	const build: CharacterBuildSelection = {
		...selection(4),
		progression: [
			{ level: 4, feat: { name: "poisoner", abilityScoreImprovement: [{ abilityScore: "dexterity", amount: 1 }] } },
		],
		stock: { poisonDoses: 1 },
	};
	const result = runDprTrial(
		input(
			build,
			{
				id: "poisoner-rest-day",
				episodes: [passive("first"), passive("second")],
				transitions: [{ afterEpisodeId: "first", elapsedMinutes: 480, rest: "long-rest" }],
			},
			{
				useOptionalFeature: (_snapshot, id) => id === "poisoner.apply-poison",
				chooseFeatureAction: (_snapshot, candidates) =>
					candidates.find((candidate) => candidate.id === "poisoner.apply.mace")?.id ?? null,
			},
		),
		fixed({ first: [10, 6, 1, 3, 4], second: [10, 6] }),
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.appliedDamage),
		[16, 9],
	);
	assert.equal(result.resourceCost["feat.poisoner.doses"], 1);
	assert.equal(result.episodes[1]?.initialResources["feat.poisoner.doses"], 0);
	assert.equal(result.appliedDamage, 25);
});

test("Poisoner consumes its coating on a lethal hit without a separate save or damage against a dead target", () => {
	const build: CharacterBuildSelection = {
		...selection(4),
		progression: [
			{ level: 4, feat: { name: "poisoner", abilityScoreImprovement: [{ abilityScore: "dexterity", amount: 1 }] } },
		],
		stock: { poisonDoses: 1 },
	};
	const result = runDprTrial(
		input(
			build,
			{
				id: "poisoner-finite-horizon",
				episodes: [
					{
						...passive("first", 3),
						targets: [{ id: "target", armorClass: 15, hitPoints: { mode: "finite", maximum: 1 }, distanceToActor: 5 }],
					},
				],
			},
			{
				useOptionalFeature: (_snapshot, id) => id === "poisoner.apply-poison",
				chooseFeatureAction: (_snapshot, candidates) =>
					candidates.find((candidate) => candidate.id === "poisoner.apply.mace")?.id ?? null,
			},
		),
		fixed({ first: [10, 6] }),
	);
	assert.equal(result.appliedDamage, 9);
	assert.equal(result.hitPointsLost, 1);
	assert.equal(result.overkill, 8);
	assert.equal(result.dpr, 3);
	assert.deepEqual(result.episodes[0]?.damageByRound, [9, 0, 0]);
	assert.deepEqual(result.episodes[0]?.attacks?.[0]?.savingThrows ?? [], []);
	assert.equal(result.resourceCost["feat.poisoner.doses"], 1);
	assert.equal(result.episodes[0]?.finalResources["feat.poisoner.doses"], 0);
});

test("Grappler frees the previous encounter's reserved hand before a new episode's punch and grab", () => {
	const build: CharacterBuildSelection = {
		...selection(4),
		progression: [
			{ level: 4, feat: { name: "grappler", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] } },
		],
	};
	const unarmed = (id: string): DprEpisode => ({
		...passive(id),
		attack: { kind: "unarmed" },
		targets: passive(id).targets.map((target) => ({
			...target,
			stats: { strength: 8, dexterity: 18, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
		})),
	});
	const result = runDprTrial(
		input(
			build,
			{
				id: "grappler-two-encounters",
				episodes: [unarmed("first"), unarmed("second")],
				transitions: [{ afterEpisodeId: "first", elapsedMinutes: 10 }],
			},
			{ useFeature: (_snapshot, id) => id === "grappler.punch-and-grab" },
		),
		fixed({ first: [10, 3], second: [10, 3] }),
	);
	assert.equal(result.appliedDamage, 8);
	assert.deepEqual(
		result.episodes.map((episode) => episode.attacks?.[0]?.savingThrows?.[0]?.ability),
		["dexterity", "dexterity"],
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.attacks?.[0]?.savingThrows?.[0]?.success),
		[false, false],
	);
});

test("opt-in Unarmed replacements use saving throws without inventing attacks or weapon inventory", () => {
	const base = selection();
	const build: CharacterBuildSelection = {
		...base,
		equipment: { ...base.equipment, weapons: [], hands: { left: null, right: null } },
	};
	const encounterEpisode: DprEpisode = {
		...passive("first"),
		allowUnarmedEffects: true,
		targets: passive("first").targets.map((target) => ({
			...target,
			stats: { strength: 8, dexterity: 18, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
		})),
	};
	const choices: Partial<CombatStrategy> = {
		chooseUnarmedEffect: (_snapshot, candidates) => {
			const index = candidates.findIndex((candidate) => candidate.effect === "shove-prone");
			return index < 0 ? null : index;
		},
	};
	const result = runDprTrial(
		input(build, { id: "pure-shove", episodes: [encounterEpisode] }, choices),
		fixed({ first: [3] }),
	);
	assert.equal(result.appliedDamage, 0);
	assert.deepEqual(result.episodes[0]?.attacks, []);
	assert.equal(result.episodes[0]?.unarmedEffects?.length, 1);
	const effect = result.episodes[0]?.unarmedEffects?.[0];
	assert.equal(effect?.effect, "shove-prone");
	assert.equal(effect?.applied, true);
	assert.equal(effect?.savingThrow.ability, "dexterity");
	assert.equal(effect?.savingThrow.bonus, 4);
	assert.equal(effect?.savingThrow.total, 7);
	const declined = runDprTrial(
		input(build, { id: "no-shove-opt-in", episodes: [{ ...encounterEpisode, allowUnarmedEffects: false }] }, choices),
		fixed({}),
	);
	assert.deepEqual(declined.episodes[0]?.unarmedEffects, []);
	assert.deepEqual(declined.episodes[0]?.attacks, []);
});

test("a Shove replacement gives the remaining Extra Attack Prone advantage in the same action", () => {
	const build: CharacterBuildSelection = {
		...selection(5),
		progression: [
			{
				level: 4,
				feat: {
					name: "ability-score-improvement",
					abilityScoreImprovement: [{ abilityScore: "intelligence", amount: 2 }],
				},
			},
		],
	};
	const result = runDprTrial(
		input(
			build,
			{ id: "shove-extra-attack", episodes: [{ ...passive("first"), allowUnarmedEffects: true }] },
			{
				chooseUnarmedEffect: (snapshot, candidates) =>
					snapshot.remainingPrimaryAttacks === 2 && candidates.length ? 0 : null,
			},
		),
		fixed({ first: [3, 2, 18, 6] }),
	);
	assert.equal(result.appliedDamage, 9);
	assert.equal(result.episodes[0]?.unarmedEffects?.length, 1);
	assert.equal(result.episodes[0]?.attacks?.length, 1);
	assert.deepEqual(result.episodes[0]?.attacks?.[0]?.hit.d20Rolls, [2, 18]);
});

test("occupied hands prevent Grapple while permitting an Unarmed damage strike", () => {
	const base = selection();
	const build: CharacterBuildSelection = {
		...base,
		equipment: { ...base.equipment, shield: true, hands: { left: "mace", right: "$shield" } },
	};
	const result = runDprTrial(
		input(
			build,
			{
				id: "kick-with-shield",
				episodes: [{ ...passive("first"), attack: { kind: "unarmed" }, allowUnarmedEffects: true }],
			},
			{
				chooseUnarmedEffect: (_snapshot, candidates) => {
					const index = candidates.findIndex((candidate) => candidate.effect === "grapple");
					return index < 0 ? null : index;
				},
			},
		),
		fixed({ first: [10] }),
	);
	assert.equal(result.appliedDamage, 4);
	assert.deepEqual(result.episodes[0]?.unarmedEffects, []);
	assert.equal(result.episodes[0]?.attacks?.length, 1);
});

test("World Tree Battering Roots extends legal Cleave reach within static target geometry", () => {
	const base = selection(14);
	const build: CharacterBuildSelection = {
		...base,
		subclass: "world-tree",
		progression: ([4, 8, 12] as const).map((level) => ({
			level,
			feat: {
				name: "ability-score-improvement",
				abilityScoreImprovement: [{ abilityScore: "intelligence", amount: 2 }],
			},
		})),
		equipment: {
			...base.equipment,
			weapons: [{ id: "axe", weaponId: "greataxe" }],
			hands: { left: "axe", right: "axe" },
		},
		masteredWeaponIds: ["greataxe"],
	};
	const extended = {
		...cleaveEpisode("inexhaustible"),
		targets: cleaveEpisode("inexhaustible").targets.map((target) => ({ ...target, distanceToActor: 15 })),
	};
	const result = runDprTrial(
		input(
			build,
			{ id: "world-tree-reach", episodes: [extended] },
			{ useFeature: (_snapshot, id) => id === "weaponMastery.cleave" },
		),
		fixed({ cleave: [10, 4, 10, 5, 10, 6] }),
	);
	assert.equal(result.appliedDamage, 21);
	assert.equal(result.episodes[0]?.attacks?.length, 2);
	assert.equal(result.episodes[0]?.attacks?.[0]?.triggeredAttacks.length, 1);
});

test("Aasimar self damage carries through Short Rest and completed Long Rest restores full actor HP", () => {
	const build: CharacterBuildSelection = { ...selection(3), species: { id: "aasimar" } };
	const result = runDprTrial(
		input(
			build,
			{
				id: "aasimar-health-day",
				episodes: [passive("first"), passive("second"), passive("third")],
				transitions: [
					{ afterEpisodeId: "first", elapsedMinutes: 60, rest: "short-rest" },
					{ afterEpisodeId: "second", elapsedMinutes: 480, rest: "long-rest" },
				],
			},
			{
				useFeature: (_snapshot, id) => id === "aasimar.celestial-revelation.damage",
				useOptionalFeature: (_snapshot, id) => id === "aasimar.celestial-revelation",
				chooseFeatureAction: (_snapshot, candidates) =>
					candidates.find((candidate) => candidate.id === "species.aasimar.celestial-revelation.activate")?.id ?? null,
				chooseFeatureOption: (_snapshot, id, candidates) =>
					id === "aasimar.celestial-revelation.form" ? "inner-radiance" : (candidates[0] ?? null),
			},
		),
		fixed({ first: [10, 6], second: [10, 6], third: [10, 6] }),
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.initialActorHealth.hitPoints),
		[32, 31, 32],
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.finalActorHealth.hitPoints),
		[31, 31, 31],
	);
	assert.deepEqual(
		result.episodes.map((episode) => episode.appliedDamage),
		[13, 9, 13],
	);
	assert.deepEqual(
		result.transitions.map((transition) => [
			transition.beforeActorHealth.hitPoints,
			transition.afterActorHealth.hitPoints,
		]),
		[
			[31, 31],
			[31, 32],
		],
	);
});

test("Aasimar extra attack damage can reduce finite HP to zero and offer Hew on a later turn", () => {
	const build: CharacterBuildSelection = {
		...selection(4),
		species: { id: "aasimar" },
		progression: [
			{
				level: 4,
				feat: { name: "great-weapon-master", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
			},
		],
	};
	const result = runDprTrial(
		input(
			build,
			{
				id: "aasimar-extra-damage-kill",
				episodes: [
					{
						id: "first",
						rounds: 2,
						targets: [
							{ id: "first", armorClass: 15, hitPoints: { mode: "finite", maximum: 21 }, distanceToActor: 5 },
							{ id: "second", armorClass: 15, hitPoints: { mode: "inexhaustible" }, distanceToActor: 5 },
						],
						initiative: { order: ["hero", "first", "second"] },
					},
				],
			},
			{
				useFeature: (_snapshot, id) => id === "aasimar.celestial-revelation.damage",
				useOptionalFeature: (_snapshot, id) => id === "aasimar.celestial-revelation",
				chooseFeatureAction: (_snapshot, candidates) =>
					candidates.find((candidate) => candidate.id === "species.aasimar.celestial-revelation.activate")?.id ?? null,
				chooseFeatureOption: (_snapshot, id, candidates) =>
					id === "aasimar.celestial-revelation.form" ? "heavenly-wings" : (candidates[0] ?? null),
				chooseHewTarget: (_snapshot, targets) => targets.find((target) => target.hitPoints > 0)?.id ?? null,
			},
		),
		fixed({ first: [10, 6, 10, 6, 10, 4] }),
	);
	assert.equal(result.appliedDamage, 29);
	assert.equal(result.hitPointsLost, 21);
	assert.equal(result.overkill, 1);
	assert.deepEqual(result.episodes[0]?.damageByRound, [11, 18]);
	assert.equal(result.episodes[0]?.attacks?.[1]?.triggeredAttacks.length, 1);
});

for (const reduction of ["slow", "slasher"] as const)
	test(`Hamstring Blow + ${reduction} + Frost's Chill can keep a passive Prone target down for next-turn DPR`, () => {
		const base = selection(9);
		const build: CharacterBuildSelection = {
			...base,
			species: { id: "goliath", ancestry: "frost" },
			progression:
				reduction === "slasher"
					? [
							{
								level: 4,
								feat: { name: "slasher", abilityScoreImprovement: [{ abilityScore: "strength", amount: 1 }] },
							},
							{
								level: 8,
								feat: {
									name: "ability-score-improvement",
									abilityScoreImprovement: [
										{ abilityScore: "strength", amount: 1 },
										{ abilityScore: "dexterity", amount: 1 },
									],
								},
							},
						]
					: ([4, 8] as const).map((level) => ({
							level,
							feat: {
								name: "ability-score-improvement",
								abilityScoreImprovement: [{ abilityScore: "intelligence", amount: 2 }],
							},
						})),
			equipment: {
				...base.equipment,
				weapons: [{ id: "weapon", weaponId: reduction === "slow" ? "club" : "greataxe" }],
				hands: { left: "weapon", right: reduction === "slasher" ? "weapon" : null },
			},
			masteredWeaponIds: reduction === "slow" ? ["club"] : [],
		};
		const scenario: DprScenario = {
			id: `prone-speed-lock-${reduction}`,
			episodes: [
				{
					...passive("first", 2),
					targets: passive("first").targets.map((target) => ({
						...target,
						speed: 30,
						conditions: [{ name: "prone" }],
					})),
				},
			],
		};
		const source = (frost: boolean): DprExperiment => ({
			...input(build, scenario, {
				useFeature: (snapshot, id) => {
					if (snapshot.turnId !== 1) return false;
					if (id === "barbarian.reckless-attack" || id === "weaponMastery.slow" || id === "slasher.hamstring")
						return true;
					return (
						snapshot.attackIndexInTurn === 0 &&
						(id === "barbarian.brutal-strike" || (frost && id === "goliath.giant-ancestry.frost"))
					);
				},
			}),
			strategyId: `first-turn-speed-lock-${reduction}-${frost}`,
			strategyParameters: { frost, reduction, recklessOnFirstTurnOnly: true },
		});
		const heldDown = runDprTrial(source(true), fixed({ first: [10, 3, 3, 3, 2, 18, 3, 2, 18, 3, 2, 18, 3] }));
		const stands = runDprTrial(source(false), fixed({ first: [10, 3, 3, 2, 18, 3, 2, 2] }));
		assert.deepEqual(
			heldDown.episodes[0]?.attacks?.map((attack) => attack.hit.d20Rolls),
			[[10], [2, 18], [2, 18], [2, 18]],
		);
		assert.deepEqual(
			stands.episodes[0]?.attacks?.map((attack) => attack.hit.d20Rolls),
			[[10], [2, 18], [2], [2]],
		);
		assert.equal(heldDown.appliedDamage, reduction === "slow" ? 30 : 34);
		assert.equal(stands.appliedDamage, reduction === "slow" ? 15 : 17);
		assert.equal(heldDown.resourceCost["species.goliath.giant-ancestry"], 1);
	});
