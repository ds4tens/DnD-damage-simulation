import BaseCharacter from "../character/BaseCharacter.ts";
import type { ResourceDefinition } from "../combat/CombatResources.ts";
import type { CombatHook, RollContext } from "../combat/CombatTypes.ts";

const hasFeat = (actor: unknown, name: string): actor is BaseCharacter =>
	actor instanceof BaseCharacter && actor.feats.some((feat) => feat.name === name);
const resource = (
	id: string,
	maxUses: number,
	shortRest: ResourceDefinition["shortRest"] = "none",
	longRest: ResourceDefinition["longRest"] = "all",
	initialUses = maxUses,
): ResourceDefinition => ({ id, maxUses, shortRest, longRest, initialUses });
const remaining = (ctx: RollContext, id: string) => ctx.encounter.resourceRemaining(ctx.actorId, id) > 0;
function canReroll(ctx: RollContext): boolean {
	if (!ctx.rollTest) return true;
	const flags = ctx.encounter.state(ctx.actorId).classState;
	return flags["reroll.d20-test"] !== ctx.rollTest.id || flags["reroll.d20-index"] === ctx.rollTest.dieIndex;
}
function markReroll(ctx: RollContext): void {
	if (!ctx.rollTest) return;
	const flags = ctx.encounter.state(ctx.actorId).classState;
	flags["reroll.d20-test"] = ctx.rollTest.id;
	flags["reroll.d20-index"] = ctx.rollTest.dieIndex;
}
/** PHB2024 p201 Lucky; XPHB card; checked2026-10-08.
 * https://5e.tools/feats.html#lucky_xphb . Advantage combines with Disadvantage;
 * this is not 2014's choose-from-three-dice rule.
 */
export const luckyHook: CombatHook = {
	id: "feat.lucky",
	featName: "lucky",
	resourceDefinitions(actor) {
		return hasFeat(actor, "lucky") ? [resource("feat.lucky", actor.getProficiencyBonus())] : [];
	},
	d20Mode(ctx, _first, mode) {
		if (ctx.forgoAdvantage || mode.advantage || !remaining(ctx, "feat.lucky") || !ctx.useFeature("lucky.advantage"))
			return { ...mode };
		ctx.encounter.spendResource(ctx.actorId, "feat.lucky");
		return { ...mode, advantage: true };
	},
};
/** PHB2024 glossary Heroic Inspiration; primary checked2026-10-08.
 * https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary#HeroicInspiration
 * Pool starts empty. Completed Human Long Rest restores one; never an encounter reset.
 */
export const heroicInspirationHook: CombatHook = {
	id: "resource.heroic-inspiration",
	resourceDefinitions(actor) {
		return actor instanceof BaseCharacter
			? [resource("heroic-inspiration", 1, "none", actor.buildData?.species.id === "human" ? "all" : "none", 0)]
			: [];
	},
	rollDie(ctx, roll) {
		if (
			!(ctx.actor instanceof BaseCharacter) ||
			!canReroll(ctx) ||
			!remaining(ctx, "heroic-inspiration") ||
			!ctx.useFeature("heroic-inspiration")
		)
			return roll.value;
		const candidates = roll.value < (roll.sides + 1) / 2 ? ["reroll", "keep"] : ["keep", "reroll"];
		if (ctx.chooseOption("heroic-inspiration.die", candidates) !== "reroll") return roll.value;
		ctx.encounter.spendResource(ctx.actorId, "heroic-inspiration");
		markReroll(ctx);
		return ctx.roller.roll(roll.sides);
	},
};
/** PHB2024 p193 Halfling Luck; primary origin text checked2026-10-08.
 * https://www.dndbeyond.com/sources/dnd/br-2024/character-origins#Halfling
 */
export const halflingLuckHook: CombatHook = {
	id: "species.halfling.luck",
	rollDie(ctx, roll) {
		if (
			!(ctx.actor instanceof BaseCharacter) ||
			ctx.actor.buildData?.species.id !== "halfling" ||
			roll.sides !== 20 ||
			roll.value !== 1 ||
			!canReroll(ctx) ||
			!["attack", "saving-throw", "initiative"].includes(roll.kind) ||
			!ctx.useFeature("halfling.luck")
		)
			return roll.value;
		markReroll(ctx);
		return ctx.roller.roll(20);
	},
};
/** PHB2024 p210, BasicRules2024 Epic Boons; primary checked2026-10-08.
 * https://www.dndbeyond.com/sources/dnd/br-2024/feats#BoonofCombatProwess
 * Start-of-owner-turn reset (not global turn), and miss-to-hit is never a new critical.
 */
export const combatProwessHook: CombatHook = {
	id: "feat.boon-of-combat-prowess",
	featName: "boon-of-combat-prowess",
	resourceDefinitions(actor) {
		return hasFeat(actor, "boon-of-combat-prowess") ? [resource("feat.boon-of-combat-prowess", 1, "none", "none")] : [];
	},
	startTurn(ctx) {
		const pool = ctx.encounter.state(ctx.actorId).resources["feat.boon-of-combat-prowess"];
		if (pool) pool.remaining = 1;
	},
	afterHit(ctx) {
		if (
			ctx.hit.isHit ||
			ctx.encounter.resourceRemaining(ctx.request.actorId, "feat.boon-of-combat-prowess") === 0 ||
			!ctx.useFeature("boon-of-combat-prowess.peerless-aim")
		)
			return ctx.hit;
		ctx.encounter.spendResource(ctx.request.actorId, "feat.boon-of-combat-prowess");
		return { ...ctx.hit, isHit: true, isCrit: false };
	},
};
/** PHB2024 p210 Boon of Fate; primary BasicRules text checked2026-10-08.
 * https://www.dndbeyond.com/sources/dnd/br-2024/feats#BoonofFate
 */
export const fateHook: CombatHook = {
	id: "feat.boon-of-fate",
	featName: "boon-of-fate",
	resourceDefinitions(actor) {
		return hasFeat(actor, "boon-of-fate") ? [resource("feat.boon-of-fate", 1, "all")] : [];
	},
	onInitiative(ctx) {
		const pool = ctx.encounter.state(ctx.actorId).resources["feat.boon-of-fate"];
		if (pool) pool.remaining = 1;
	},
	afterHit(ctx) {
		if (
			ctx.encounter.resourceRemaining(ctx.request.actorId, "feat.boon-of-fate") === 0 ||
			!ctx.useFeature("boon-of-fate.improve-fate")
		)
			return ctx.hit;
		const options =
			ctx.hit.isHit || ctx.hit.d20Roll === 1 ? ["decline", "add", "subtract"] : ["add", "decline", "subtract"];
		const selected = ctx.chooseOption("boon-of-fate.attack", options);
		if (selected === null || selected === "decline") return ctx.hit;
		ctx.encounter.spendResource(ctx.request.actorId, "feat.boon-of-fate");
		const amount = (ctx.roller.roll(4) + ctx.roller.roll(4)) * (selected === "add" ? 1 : -1);
		const totalAttackRoll = ctx.hit.totalAttackRoll + amount;
		const isHit = ctx.hit.d20Roll === 20 || (ctx.hit.d20Roll !== 1 && totalAttackRoll >= ctx.target.armorClass);
		return { ...ctx.hit, totalAttackRoll, isHit, isCrit: isHit && ctx.hit.isCrit };
	},
	afterSavingThrow(ctx, result) {
		if (
			result.total === null ||
			result.outcome !== "rolled" ||
			!hasFeat(ctx.actor, "boon-of-fate") ||
			!remaining(ctx, "feat.boon-of-fate")
		)
			return result;
		const self = ctx.actorId === ctx.request.targetId;
		const distance = self ? 0 : ctx.distanceTo(ctx.request.targetId);
		if (distance === undefined || distance > 60 || !ctx.useFeature("boon-of-fate.improve-fate")) return result;
		const choices =
			self && !result.success
				? ["add", "decline", "subtract"]
				: !self && result.success
					? ["subtract", "decline", "add"]
					: ["decline", "add", "subtract"];
		const selected = ctx.chooseOption("boon-of-fate.saving-throw", choices);
		if (selected === null || selected === "decline") return result;
		ctx.encounter.spendResource(ctx.actorId, "feat.boon-of-fate");
		const total = result.total + (ctx.roller.roll(4) + ctx.roller.roll(4)) * (selected === "add" ? 1 : -1);
		return { ...result, total, success: total >= result.dc };
	},
};
export const globalRollHooks: readonly CombatHook[] = Object.freeze([
	Object.freeze(halflingLuckHook),
	Object.freeze(heroicInspirationHook),
]);
