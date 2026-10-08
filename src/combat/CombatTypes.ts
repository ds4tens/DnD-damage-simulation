import type BaseCharacter from "../character/BaseCharacter.ts";
import type { TStatsType } from "../character/BaseCharacter.ts";
import type { DiceRoller } from "../dice/RandomSource.ts";
import type { FeatName } from "../feats/FeatTypes.ts";
import type { WeaponCatalogId } from "../Items/Weapon/WeaponList.ts";
import type Weapon from "../Items/Weapon.ts";
import type { TConditionState } from "../modifiers/Conditions.ts";
import type { TCombatModifier } from "../modifiers/Modifiers.ts";
import type BaseMonster from "../monster/BaseMonster.ts";
import type { PersistentResourceSnapshot, ResourceDefinition } from "./CombatResources.ts";
import type { DamageComponent, DamagePool, DamageResult, DamageType, RolledDamageDie } from "./DamageTypes.ts";
import type { CombatantState, EffectInput, EncounterState, TimedEffect } from "./EncounterState.ts";
import type { DeathSaveResult, LifeState, ZeroHpBehavior } from "./HitPointTypes.ts";
import type { SavingThrowRequest, SavingThrowResult } from "./SavingThrowTypes.ts";
import type { CombatStrategy } from "./Strategy.ts";

export type CombatantDefinition = BaseCharacter | BaseMonster;
export type CreatureSize = "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";
export type CombatantInput = {
	id: string;
	definition: CombatantDefinition;
	initialClassState?: Record<string, number | boolean | string>;
	initialResources?: PersistentResourceSnapshot;
	hitPointMode?: "finite" | "inexhaustible";
	size?: CreatureSize;
	initialSpentWeaponInstanceIds?: readonly string[];
	initialHitPoints?: number;
	initialTemporaryHp?: number;
	zeroHpBehavior?: ZeroHpBehavior;
	weapons?: readonly WeaponInstance[];
	initialHands?: HandState;
	/** Canonical base-2024 weapon type selections; distinct from physical instance IDs. */
	masteredWeaponIds?: readonly WeaponCatalogId[];
	/** Raw names/custom extension types are runtime-validated; use IDs for base content. */
	masteredWeaponNames?: readonly string[];
};
export type WeaponInstance = { id: string; weapon: Weapon };
export type HandState = { left: string | null; right: string | null };
/** Runtime identity is checked by the issuing engine; fields alone grant no authority. */
export type AttackActionHandle = Readonly<{ id: string; actorId: string; turnId: number }>;
export type AttackGrant = Readonly<{ id: string; actorId: string; turnId: number }>;
export type ActionSource = "attack-action" | "bonus-action" | "reaction";
export type AttackOrigin =
	| "primary"
	| "light"
	| "nick"
	| "cleave"
	| "hew"
	| "pole-strike"
	| "dual-wielder"
	| "scenario";
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
	/** Dual Wielder Quick Draw: second physical weapon operation in the same timing window. */
	equipAdditional?: NonNullable<AttackRequest["equip"]>;
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
	weaponInstanceId?: string;
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
	additionalDamage?: readonly DamageResult[];
};
export type CombatDamageEvent = { actorId: string; targetId: string; source: string; result: DamageResult };
export type UnarmedEffectSelection = { targetId: string; effect: "grapple" | "shove-prone" };
export type UnarmedEffectResult = UnarmedEffectSelection & {
	effectId: string;
	actorId: string;
	turnId: number;
	actionId: string;
	attackIndexInTurn: number;
	savingThrow: SavingThrowResult;
	applied: boolean;
	handReserved?: "left" | "right";
};
export type AttackActionOptions = {
	mode?: AttackMode;
	weapon?: Weapon;
	distance?: number;
	unarmed?: boolean;
	unarmedEffects?: boolean;
};
export type AttackActionResult = {
	totalDamage: number;
	attacks: readonly AttackResult[];
	unarmedEffects?: readonly UnarmedEffectResult[];
};
export type TurnStartResult = { ownerId: string; turnId: number; roundNumber: number; deathSave?: DeathSaveResult };
export type DecisionRecord = { feature: string; choice: boolean | string | null; candidates?: readonly DamagePool[] };
export type TargetSnapshot = {
	id: string;
	armorClass: number;
	hitPoints: number;
	speed: number;
	lifeState?: LifeState;
	temporaryHp?: number;
	conditions?: readonly Readonly<TConditionState>[];
	hitPointMode?: "finite" | "inexhaustible";
	resources?: PersistentResourceSnapshot;
	classState?: Readonly<Record<string, number | boolean | string>>;
	size?: CreatureSize;
};
export type ActionSnapshot = {
	actor: TargetSnapshot;
	targets: readonly TargetSnapshot[];
	turnId: number;
	actionId: string;
	remainingPrimaryAttacks: number;
	bonusActionAvailable: boolean;
	reactionAvailable: boolean;
	effects: readonly Readonly<TimedEffect>[];
};
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
	attackAbility?: TStatsType;
	attackIndexInTurn?: number;
};
export type FeatureActionWindow = "before-attack" | "after-attack";
export type FeatureSnapshot = {
	actor: TargetSnapshot;
	targets: readonly TargetSnapshot[];
	turnId: number | null;
	turnOwnerId: string | null;
	window: FeatureActionWindow | "initiative" | "roll";
	actionAvailable: boolean;
	bonusActionAvailable: boolean;
	roll?: Readonly<{ sides: number; value: number; kind: RollKind }>;
	savingThrow?: Readonly<SavingThrowResult>;
};
export type FeatureActionChoice = {
	id: string;
	cost: "action" | "bonus-action" | "none";
	targetId?: string;
	purpose?: "end";
};
export type FeatureAction = FeatureActionChoice & {
	/** These callbacks are trusted rules; candidates expose only detached metadata. */
	validate?: (ctx: FeatureActionContext) => boolean;
	execute?: (ctx: FeatureActionContext) => void;
	attack?: AttackSelection;
	/** Trusted feature rule, attached to its engine-issued grant only. */
	attackDamage?: { dice: readonly number[]; damageType: DamageType; suppressPositiveAbility?: boolean };
};
export type FeatureActionContext = {
	actorId: string;
	actor: CombatantDefinition;
	encounter: EncounterState;
	roller: DiceRoller;
	window: FeatureActionWindow;
	completedAttackActionId?: string;
	useFeature(featureId: string): boolean;
	chooseOption(featureId: string, candidates: readonly string[]): string | null;
	resolveSavingThrow(request: SavingThrowRequest): SavingThrowResult;
	dealDamage(targetId: string, components: readonly DamageComponent[]): DamageResult;
	distanceTo(targetId: string): number | undefined;
};
export type FeatureActionResult = {
	featureId: string;
	actorId: string;
	decisions: readonly DecisionRecord[];
	attacks: readonly AttackResult[];
};
export type RollKind = "attack" | "damage" | "saving-throw" | "initiative" | "feature";
export type RollContext = {
	actorId: string;
	actor: CombatantDefinition;
	encounter: EncounterState;
	/** Raw roller: replacements never recursively trigger the same window. */
	roller: DiceRoller;
	kind: RollKind;
	rollTest?: Readonly<{ id: string; dieIndex: number }>;
	forgoAdvantage?: boolean;
	savingThrow?: Readonly<SavingThrowResult>;
	distanceTo(targetId: string): number | undefined;
	useFeature(featureId: string): boolean;
	chooseOption(featureId: string, candidates: readonly string[]): string | null;
};
export type SaveEventContext = RollContext & { request: Readonly<SavingThrowRequest> };
export type AttackContext = {
	encounter: EncounterState;
	roller: DiceRoller;
	damageRoller: DiceRoller;
	attacker: CombatantDefinition;
	character: BaseCharacter | undefined;
	attackAbility: TStatsType;
	preparedWeapon?: PreparedWeaponAttack;
	target: CombatantDefinition;
	actorState: CombatantState;
	targetState: CombatantState;
	request: AttackRequest;
	weapon: Weapon | undefined;
	attackIndexInTurn: number;
	hasHitOccurredThisTurn: boolean;
	distance?: number;
	hit?: HitResult;
	primaryDamage?: DamageResult;
	decisions: DecisionRecord[];
	featureSelections: Record<string, string | boolean>;
	isOwnTurn: boolean;
	distanceTo(targetId: string): number | undefined;
	canSee?: (observerId: string, targetId: string) => boolean;
	hasUsed(featureId: string): boolean;
	markUsed(featureId: string): void;
	useFeature(featureId: string): boolean;
	chooseOption(featureId: string, candidates: readonly string[]): string | null;
	resolveSavingThrow(request: SavingThrowRequest): SavingThrowResult;
	/** Trusted Unarmed Damage+Grapple rules; undefined means the size/hand requirements fail. */
	resolveGrapple(targetId: string): SavingThrowResult | undefined;
	dealDamage(targetId: string, components: readonly DamageComponent[]): DamageResult;
	/** Same-attack post-primary rider: critical copies and attack-wide reroll window, no weapon-only rerolls. */
	dealAttackRiderDamage(targetId: string, components: readonly DamageComponent[]): DamageResult;
	d20Mode(
		first: number,
		mode: { advantage: boolean; disadvantage: boolean },
	): { advantage: boolean; disadvantage: boolean };
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
	/** Passive pools, called once per participant when an engine is created. */
	resourceDefinitions?: (definition: CombatantDefinition) => readonly ResourceDefinition[];
	featureActions?: (ctx: FeatureActionContext) => readonly FeatureAction[];
	rollDie?: (ctx: RollContext, roll: Readonly<{ sides: number; value: number; kind: RollKind }>) => number;
	d20Mode?: (
		ctx: RollContext,
		first: number,
		mode: Readonly<{ advantage: boolean; disadvantage: boolean }>,
	) => { advantage: boolean; disadvantage: boolean };
	startTurn?: (ctx: FeatureActionContext) => void;
	endTurn?: (ctx: FeatureActionContext) => void;
	onInitiative?: (ctx: RollContext) => void;
	beforeAttack?: (ctx: AttackContext) => void;
	prepareAttack?: (ctx: AttackContext, modifier: TCombatModifier) => TCombatModifier;
	afterHitDamage?: (ctx: HitContext, result: AttackResult) => void;
	afterHit?: (ctx: HitContext) => HitResult;
	ignoreResistance?: (ctx: RollContext, targetId: string, damageType: DamageType) => boolean;
	afterSavingThrow?: (ctx: SaveEventContext, result: SavingThrowResult) => SavingThrowResult;
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
	/** Scenario sight override, including creatures that can see Invisible targets. */
	canSee?: (observerId: string, targetId: string) => boolean;
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
