import assert from "node:assert/strict";
import test from "node:test";
import { buildLegalCharacter, combatantInputForBuild } from "../character/CharacterBuild.ts";
import { CombatEngine } from "../combat/AttackResolver.ts";
import { EncounterState } from "../combat/EncounterState.ts";
import { FixedDiceRoller } from "../dice/RandomSource.ts";
import BaseMonster from "../monster/BaseMonster.ts";
import { carryActorToNextEpisode } from "./ActorCarry.ts";

function build() {
	return buildLegalCharacter({
		ruleset: "phb-2024",
		className: "barbarian",
		level: 1,
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
	});
}

test("completed encounter transfer preserves prepared HP/TempHP through Short Rest and Long Rest restores health", () => {
	const legal = build();
	// Low-level supported input fixture, not a new production benefit or a mutated legal definition.
	const first = new EncounterState([
		{ ...combatantInputForBuild(legal, "hero"), initialHitPoints: 8, initialTemporaryHp: 7 },
	]);
	const engine = new CombatEngine(first, { roller: new FixedDiceRoller([]) });
	engine.advanceElapsedTime(60);
	engine.completeRest("hero", "short-rest");
	const second = new EncounterState([carryActorToNextEpisode(legal, engine)]);
	assert.equal(second.state("hero").hitPoints, 8);
	assert.equal(second.state("hero").temporaryHp, 7);
	assert.equal(legal.character.hitPoints, 15);
	const nextEngine = new CombatEngine(second, { roller: new FixedDiceRoller([]) });
	nextEngine.advanceElapsedTime(480);
	nextEngine.completeRest("hero", "long-rest");
	const third = new EncounterState([carryActorToNextEpisode(legal, nextEngine)]);
	assert.equal(third.state("hero").hitPoints, 15);
	assert.equal(third.state("hero").temporaryHp, 0);
	assert.equal(first.state("hero").hitPoints, 8);
	assert.equal(first.state("hero").temporaryHp, 7);
});

test("completed encounter transfer releases a real Grapple reservation while retaining weapon hands", () => {
	const legal = build();
	const first = new EncounterState([
		combatantInputForBuild(legal, "hero"),
		{ id: "old-target", definition: new BaseMonster("Target", 15, 10) },
	]);
	const engine = new CombatEngine(first, { roller: new FixedDiceRoller([3]) });
	engine.beginTurn("hero");
	const action = engine.beginAttackAction("hero");
	const grapple = engine.resolveUnarmedEffectInAction(action, { targetId: "old-target", effect: "grapple" });
	assert.equal(grapple.applied, true);
	assert.deepEqual(first.state("hero").hands, { left: "mace", right: "$grapple:old-target" });
	engine.finishAttackAction(action);
	engine.endTurn();
	engine.advanceElapsedTime(10);
	const second = new EncounterState([carryActorToNextEpisode(legal, engine)]);
	assert.deepEqual(second.state("hero").hands, { left: "mace", right: null });
	assert.equal(second.ids.includes("old-target"), false);
	assert.equal(second.state("hero").conditions.length, 0);
});
