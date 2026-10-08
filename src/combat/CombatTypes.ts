import type BaseCharacter from "../character/BaseCharacter.ts";
import type { TStatsType } from "../character/BaseCharacter.ts";
import type { DiceRoller } from "../dice/RandomSource.ts";
import type { FeatName } from "../feats/FeatTypes.ts";
import type Weapon from "../Items/Weapon.ts";
import type { TConditionState } from "../modifiers/Conditions.ts";
import type { TCombatModifier } from "../modifiers/Modifiers.ts";
import type BaseMonster from "../monster/BaseMonster.ts";
import type { DamageComponent, DamagePool, DamageResult, RolledDamageDie } from "./DamageTypes.ts";
import type { CombatantState, EffectInput, EncounterState } from "./EncounterState.ts";
import type { ZeroHpBehavior } from "./HitPointTypes.ts";
import type { SavingThrowResult } from "./SavingThrowTypes.ts";
import type { CombatStrategy } from "./Strategy.ts";

export type CombatantDefinition = BaseCharacter | BaseMonster;
export type CombatantInput = {
	id: string;
	definition: CombatantDefinition;
	initialClassState?: Record<string, number | boolean | string>;
	initialHitPoints?: number;
	initialTemporaryHp?: number;
	zeroHpBehavior?: ZeroHpBehavior;
	weapons?: readonly WeaponInstance[];
	initialHands?: HandState;
	masteredWeaponNames?: readonly string[];
};
export type WeaponInstance = { id: string; weapon: Weapon };
export type HandState = { left: string | null; right: string | null };
/** Runtime identity is checked by the issuing engine; fields alone grant no authority. */
export type AttackActionHandle = Readonly<{ id: string; actorId: string; turnId: number }>;
export type AttackGrant = Readonly<{ id: string; actorId: string; turnId: number }>;
export type ActionSource = "attack-action" | "bonus-action" | "reaction";
export type AttackOrigin = "primary" | "light" | "nick" | "cleave" | "hew" | "scenario";
export type AttackMode = "melee" | "ranged" | "thrown";
export type AttackRequest = {
	actorId: string;
	targetId: string;
	actionSource: ActionSource;
	actionId?: string;
	action?: AttackActionHandle;
	grant?: AttackGrant;
	attackOrigin?: AttackOrigin;
	parentAttackId?: string;
	weaponInstanceId?: string;
	ability?: TStatsType;
	grip?: "one-handed" | "two-handed";
	equip?: {
		kind: "draw" | "stow";
		weaponInstanceId: string;
		hand: "left" | "right" | "both";
		when: "before" | "after";
	};
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
	actionId?: string;
	attackOrigin: AttackOrigin;
	parentAttackId?: string;
	roundNumber: number;
	source: string;
	attackIndexInTurn: number;
	hit: HitResult;
	damage?: DamageResult;
	decisions: readonly DecisionRecord[];
	triggeredAttacks: readonly AttackResult[];
	limitations: readonly string[];
	savingThrows?: readonly SavingThrowResult[];
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
	attackAbility: TStatsType;
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
	addEffect(effect: EffectInput): void;
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
	/** Trusted scenario reaction triggers are opt-in; their attacks still spend Reaction. */
	allowScenarioReactions?: boolean;
	cleaveCandidates?: (actorId: string, primaryTargetId: string, turnId: number) => readonly CleaveCandidate[];
};
export type AttackSelection = Omit<AttackRequest, "actorId" | "actionSource" | "actionId" | "action" | "grant">;
export type CleaveCandidate = { targetId: string; distanceToActor: number; distanceToPrimary: number };
export type PreparedWeaponAttack = {
	instance: WeaponInstance;
	attackAbility: TStatsType;
	attackBonus: number;
	damageComponents: readonly DamageComponent[];
	attackModifiers: readonly TCombatModifier[];
	nextHands: HandState;
	manipulationCost: number;
	loadingKey?: string;
	thrownInstanceId?: string;
	limitations: readonly string[];
};
export type MasteryHitContribution = {
	effects?: readonly EffectInput[];
	addConditions?: readonly TConditionState[];
	cleaveEligible?: boolean;
	savingThrows?: readonly SavingThrowResult[];
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
