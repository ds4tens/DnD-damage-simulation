import type BaseCharacter from "../character/BaseCharacter.ts";
import type { DiceRoller } from "../dice/RandomSource.ts";
import type { FeatName } from "../feats/FeatTypes.ts";
import type Weapon from "../Items/Weapon.ts";
import type { TConditionState } from "../modifiers/Conditions.ts";
import type { TCombatModifier } from "../modifiers/Modifiers.ts";
import type BaseMonster from "../monster/BaseMonster.ts";
import type { DamageComponent, DamagePool, DamageResult, RolledDamageDie } from "./DamageTypes.ts";
import type { CombatantState, EncounterState, TimedEffect } from "./EncounterState.ts";
import type { CombatStrategy } from "./Strategy.ts";

export type CombatantDefinition = BaseCharacter | BaseMonster;
export type CombatantInput = {
	id: string;
	definition: CombatantDefinition;
	initialClassState?: Record<string, number | boolean | string>;
};
export type ActionSource = "attack-action" | "bonus-action" | "reaction" | "other";
export type AttackMode = "melee" | "ranged" | "thrown";
export type AttackRequest = {
	actorId: string;
	targetId: string;
	actionSource: ActionSource;
	actionId?: string;
	mode: AttackMode;
	weapon?: Weapon;
	distance?: number;
	/** Explicit profile for monsters, Unarmed Strikes and test/scenario contributions. */
	profile?: { attackBonus: number; damage: readonly DamageComponent[] };
};
export type HitResult = {
	d20Roll: number;
	d20Rolls: readonly number[];
	totalAttackRoll: number;
	isHit: boolean;
	isCrit: boolean;
};
export type AttackResult = {
	mode: AttackMode;
	weapon?: { name: string; category: "melee" | "ranged"; properties: readonly string[] };
	attackId: string;
	actorId: string;
	targetId: string;
	turnId: number;
	actionSource: ActionSource;
	source: string;
	attackIndexInTurn: number;
	hit: HitResult;
	damage?: DamageResult;
	decisions: readonly DecisionRecord[];
	triggeredAttacks: readonly AttackResult[];
	limitations: readonly string[];
};
export type AttackActionResult = { totalDamage: number; attacks: readonly AttackResult[] };
export type DecisionRecord = { feature: string; choice: boolean | string | null; candidates?: readonly DamagePool[] };
export type TargetSnapshot = { id: string; armorClass: number; hitPoints: number; speed: number };
export type AttackSnapshot = {
	actorId: string;
	targetId: string;
	turnId: number;
	turnOwnerId: string;
	actionSource: ActionSource;
	isOwnTurn: boolean;
	bonusActionAvailable: boolean;
	weapon?: { name: string; category: "melee" | "ranged"; properties: readonly string[] };
	hit?: HitResult;
	actor: TargetSnapshot;
	target: TargetSnapshot;
};
export type AttackContext = {
	encounter: EncounterState;
	roller: DiceRoller;
	attacker: CombatantDefinition;
	character: BaseCharacter | undefined;
	target: CombatantDefinition;
	actorState: CombatantState;
	targetState: CombatantState;
	request: AttackRequest;
	weapon: Weapon | undefined;
	attackIndexInTurn: number;
	hasHitOccurredThisTurn: boolean;
	distance?: number;
	hit?: HitResult;
	decisions: DecisionRecord[];
	isOwnTurn: boolean;
	hasUsed(featureId: string): boolean;
	markUsed(featureId: string): void;
	useFeature(featureId: string): boolean;
	chooseWeaponRoll(candidates: readonly DamagePool[]): number;
	choosePunctureDie(dice: readonly RolledDamageDie[]): string | null;
	choosePiercerCriticalDie(dice: readonly RolledDamageDie[]): string | null;
	chooseHewTarget(): string | null;
	addEffect(effect: Omit<TimedEffect, "createdTurnId">): void;
};
export type HitContext = AttackContext & { hit: HitResult };
export type TriggeredAttack = { targetId: string; source: string };
/** Hooks are resolved in named phases, independently of registration order between phases. */
export type CombatHook = {
	id: string;
	featName?: FeatName;
	applies?: (ctx: AttackContext) => boolean;
	attackModifiers?: (ctx: AttackContext) => readonly TCombatModifier[];
	weaponDamage?: (ctx: HitContext, pool: DamagePool) => DamagePool;
	damageComponents?: (ctx: HitContext) => readonly DamageComponent[];
	additionalCriticalDice?: (ctx: HitContext, pool: DamagePool) => DamagePool;
	afterDamageRoll?: (ctx: HitContext, pool: DamagePool) => DamagePool;
	onHit?: (ctx: HitContext, pool: DamagePool) => void;
	afterAttack?: (ctx: AttackContext, result: AttackResult) => readonly TriggeredAttack[];
};
export type TurnContext = { actor: CombatantDefinition; encounter: EncounterState; actorState: CombatantState };
export type AttackEligibility = (request: Readonly<AttackRequest>, encounter: EncounterState) => boolean;
export type CombatEngineOptions = {
	roller: DiceRoller;
	hooks?: readonly CombatHook[];
	strategy?: Partial<CombatStrategy>;
	/** Scenario-level visibility/range constraints. Weapon reach/range is additionally checked. */
	canAttack?: AttackEligibility;
	/** Optional scenario geometry, recomputed when Hew switches targets. */
	distanceFor?: (actorId: string, targetId: string) => number | undefined;
};

// Existing names remain aliases while consumers migrate to the encounter API.
export type TCombatTarget = CombatantDefinition;
export type TTurnContext = TurnContext;
export type TAttackContext = AttackContext;
export type THitResult = HitResult;
export type TPostHitContext = HitContext;
export type TDamageRollContext = HitContext;
export type TMissContext = HitContext;
export type TAttackResult = AttackResult;
export type TAttackTurnResult = AttackActionResult;
export type TDamageResult = DamageResult;
export type TConditionSnapshot = Readonly<TConditionState>;
