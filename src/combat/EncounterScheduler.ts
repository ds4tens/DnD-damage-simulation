import BaseCharacter from "../character/BaseCharacter.ts";
import type { DiceRoller } from "../dice/RandomSource.ts";
import { exhaustionPenalty } from "../modifiers/Conditions.ts";
import type { CombatEngine } from "./AttackResolver.ts";
import type { EncounterState } from "./EncounterState.ts";
import { rollD20Test } from "./SavingThrowResolver.ts";

export type InitiativeOptions = {
	/** Explicit scenario order, instead of rolling Initiative. */
	order?: readonly string[];
	/** Complete permutation used to resolve ties; defaults to participant input order. */
	tieOrder?: readonly string[];
	surprisedIds?: readonly string[];
	/** Identical monsters with matching Initiative modifiers share one roll. */
	groups?: readonly (readonly string[])[];
};
export type InitiativeResult = {
	actorId: string;
	natural: number | null;
	d20Rolls: readonly number[];
	total: number | null;
};
function permutation(order: readonly string[], encounter: EncounterState): void {
	if (
		order.length !== encounter.ids.length ||
		new Set(order).size !== order.length ||
		order.some((id) => !encounter.ids.includes(id))
	)
		throw new Error("Initiative order must include each participant exactly once");
}
/** Basic Rules 2024 Playing the Game: Initiative/Your Turn; verified 2026-10-08. */
export function rollInitiative(
	encounter: EncounterState,
	roller: DiceRoller,
	options: InitiativeOptions = {},
	engine?: CombatEngine,
) {
	if (options.order) {
		permutation(options.order, encounter);
		return {
			order: Object.freeze([...options.order]),
			rolls: Object.freeze(
				options.order.map(
					(actorId) => ({ actorId, natural: null, d20Rolls: [], total: null }) satisfies InitiativeResult,
				),
			),
		};
	}
	const tieOrder = options.tieOrder ?? encounter.ids;
	permutation(tieOrder, encounter);
	const surprised = new Set(options.surprisedIds ?? []);
	for (const id of surprised) encounter.definition(id);
	const profiles = new Map(
		encounter.ids.map((id) => {
			const actor = encounter.definition(id);
			const conditions = encounter.state(id).conditions;
			return [
				id,
				{
					bonus:
						actor.getStatModifier("dexterity") +
						exhaustionPenalty(conditions) +
						(actor instanceof BaseCharacter && actor.feats.some((feat) => feat.name === "alert")
							? actor.getProficiencyBonus()
							: 0),
					advantage:
						conditions.some((condition) => condition.name === "invisible") ||
						(actor instanceof BaseCharacter && actor.characterClass.getInitiativeAdvantage(actor.level)),
					disadvantage:
						surprised.has(id) ||
						conditions.some((condition) =>
							["incapacitated", "paralyzed", "stunned", "unconscious"].includes(condition.name),
						),
				},
			];
		}),
	);
	const groups = new Map<string, readonly string[]>();
	for (const group of options.groups ?? []) {
		if (group.length < 2 || new Set(group).size !== group.length) throw new Error("Invalid Initiative group");
		const firstId = group[0];
		if (!firstId) throw new Error("Invalid Initiative group");
		const first = encounter.definition(firstId);
		if (first instanceof BaseCharacter) throw new Error("Initiative groups require monsters");
		for (const id of group) {
			const actor = encounter.definition(id);
			if (
				groups.has(id) ||
				actor instanceof BaseCharacter ||
				actor.name !== first.name ||
				JSON.stringify(profiles.get(id)) !== JSON.stringify(profiles.get(firstId))
			)
				throw new Error("Initiative groups require identical monsters with matching modifiers");
			groups.set(id, group);
		}
	}
	const results = new Map<string, InitiativeResult>();
	for (const actorId of encounter.ids) {
		if (results.has(actorId)) continue;
		const profile = profiles.get(actorId);
		if (!profile) throw new Error("Unknown Initiative participant");
		const rolled = rollD20Test(
			engine?.actorRoller(actorId, "initiative") ?? roller,
			profile.advantage,
			profile.disadvantage,
			engine ? (first, mode) => engine.modifyD20Mode(actorId, "initiative", first, mode) : undefined,
		);
		for (const id of groups.get(actorId) ?? [actorId])
			results.set(id, {
				actorId: id,
				natural: rolled.natural,
				d20Rolls: [...rolled.d20Rolls],
				total: rolled.natural + profile.bonus,
			});
	}
	const order = [...encounter.ids].sort(
		(left, right) =>
			(results.get(right)?.total ?? 0) - (results.get(left)?.total ?? 0) ||
			tieOrder.indexOf(left) - tieOrder.indexOf(right),
	);
	return {
		order: Object.freeze(order),
		rolls: Object.freeze([...results.values()].map((result) => Object.freeze(result))),
	};
}

/** The scheduler selects boundaries; only CombatEngine processes their rules. */
export class EncounterScheduler {
	readonly order: readonly string[];
	readonly initiative: readonly InitiativeResult[];
	private index = 0;
	private currentRound = 1;
	private opened = false;
	constructor(
		private readonly engine: CombatEngine,
		roller: DiceRoller,
		options: InitiativeOptions = {},
	) {
		engine.assertCanAttachScheduler();
		const initiative = rollInitiative(engine.encounter, roller, options, engine);
		engine.encounter.setLifecycleMode("scheduled");
		this.order = initiative.order;
		this.initiative = initiative.rolls;
		engine.attachScheduler(this);
		engine.processScheduledInitiative(this);
	}
	get roundNumber(): number {
		return this.currentRound;
	}
	get nextActorId(): string {
		const actorId = this.order[this.index];
		if (!actorId) throw new Error("An encounter scheduler requires participants");
		return actorId;
	}
	beginNextTurn() {
		if (this.opened) throw new Error("End the current scheduled turn first");
		const result = this.engine.beginScheduledTurn(this, this.nextActorId, this.currentRound);
		this.opened = true;
		return result;
	}
	endTurn(): void {
		if (!this.opened) throw new Error("No scheduled turn is active");
		this.engine.endScheduledTurn(this);
		this.opened = false;
		this.index++;
		if (this.index === this.order.length) {
			this.index = 0;
			this.currentRound++;
		}
	}
}
