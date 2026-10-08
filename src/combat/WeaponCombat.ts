import type { TStatsType } from "../character/BaseCharacter.ts";
import BaseCharacter from "../character/BaseCharacter.ts";
import { weaponCatalog } from "../Items/Weapon/WeaponList.ts";
import type Weapon from "../Items/Weapon.ts";
import type { TCombatModifier } from "../modifiers/Modifiers.ts";
import type { AttackRequest, HandState, PreparedWeaponAttack, WeaponInstance } from "./CombatTypes.ts";
import type { EncounterState } from "./EncounterState.ts";

/** Basic Rules 2024 Equipment (Properties), Rules Glossary (Attack); SRD 5.2.1.
 * https://www.dndbeyond.com/sources/dnd/br-2024/equipment#Properties
 * Verified 2026-10-08 with PHB errata v2.0. This module never spends actions or rolls.
 */
export function validateMasterySelections(encounter: EncounterState, actorId: string): void {
	const actor = encounter.definition(actorId);
	const selections = encounter.masteredWeaponNames(actorId);
	if (!(actor instanceof BaseCharacter)) {
		if (selections.length > 0) throw new Error("Weapon Mastery needs an explicit character entitlement");
		return;
	}
	const allowed = actor.characterClass.getWeaponMasteryCount(actor.level);
	let classSelectionCount = 0;
	const selectedTypes = new Set<string>();
	for (const name of selections) {
		const weapon =
			encounter.weapons(actorId).find((item) => item.weapon.name === name || item.weapon.id === name)?.weapon ??
			weaponCatalog.find((item) => item.name === name || item.id === name);
		if (!weapon || !weapon.weaponMastery) throw new Error(`Unknown Weapon Mastery selection: ${name}`);
		if (selectedTypes.has(weapon.id)) throw new Error("Duplicate Weapon Mastery selection");
		selectedTypes.add(weapon.id);
		const featMastered = actor.feats.some(
			(feat) => feat.name === "weapon-master" && feat.choices?.weaponMastery === weapon.id,
		);
		if (!featMastered) {
			classSelectionCount++;
			if (classSelectionCount > allowed) throw new Error("Too many selected Weapon Mastery types");
			if (!actor.characterClass.canUseWeaponMastery(weapon))
				throw new Error(`Weapon Mastery unavailable: ${weapon.name}`);
		}
		if (!actor.characterClass.isProficientWithWeapon(weapon))
			throw new Error(`Weapon Mastery selection requires proficiency: ${weapon.name}`);
	}
}

export function selectWeaponInstance(encounter: EncounterState, request: AttackRequest): WeaponInstance {
	if (request.weaponInstanceId !== undefined) {
		const instance = encounter.weaponInstance(request.actorId, request.weaponInstanceId);
		if (request.weapon && request.weapon.name !== instance.weapon.name)
			throw new Error("Weapon selection does not match its instance");
		return instance;
	}
	const actor = encounter.definition(request.actorId);
	const name = request.weapon?.name ?? (actor instanceof BaseCharacter ? actor.weapon.name : undefined);
	const available = encounter
		.weapons(request.actorId)
		.filter(
			(item) =>
				(name === undefined || item.weapon.name === name) &&
				!encounter.state(request.actorId).spentWeaponInstanceIds.has(item.id),
		);
	const hands = encounter.state(request.actorId).hands;
	const instance = available.find((item) => item.id === hands.left || item.id === hands.right) ?? available[0];
	if (!instance) throw new Error("No available weapon instance");
	return instance;
}

function selectAbility(encounter: EncounterState, request: AttackRequest, weapon: Weapon): TStatsType {
	const actor = encounter.definition(request.actorId);
	const normalAbility = weapon.category === "melee" ? "strength" : "dexterity";
	const permitted: readonly TStatsType[] = weapon.properties.includes("finesse")
		? ["strength", "dexterity"]
		: [normalAbility];
	const legacy = actor instanceof BaseCharacter ? actor.weaponPrimaryStat : undefined;
	const ability = request.ability ?? (legacy && permitted.includes(legacy) ? legacy : normalAbility);
	if (!permitted.includes(ability)) throw new Error(`Invalid attack ability for ${weapon.name}`);
	return ability;
}

function applyEquip(
	encounter: EncounterState,
	actorId: string,
	hands: HandState,
	equip: NonNullable<AttackRequest["equip"]>,
): void {
	encounter.weaponInstance(actorId, equip.weaponInstanceId);
	if (encounter.state(actorId).spentWeaponInstanceIds.has(equip.weaponInstanceId))
		throw new Error("Thrown weapon instance cannot be recovered by drawing it");
	const selected: readonly (keyof HandState)[] = equip.hand === "both" ? ["left", "right"] : [equip.hand];
	if (equip.kind === "draw") {
		if (selected.some((hand) => hands[hand] !== null)) throw new Error("Cannot draw into an occupied hand");
		if (hands.left === equip.weaponInstanceId || hands.right === equip.weaponInstanceId)
			throw new Error("Weapon instance is already held");
		for (const hand of selected) hands[hand] = equip.weaponInstanceId;
	} else if (equip.kind === "stow") {
		if (!selected.some((hand) => hands[hand] === equip.weaponInstanceId))
			throw new Error("Weapon is not held in selected hand");
		if (selected.some((hand) => hands[hand] !== equip.weaponInstanceId))
			throw new Error("Cannot stow a different weapon");
		// Stowing a weapon removes the whole instance, including a two-handed grip.
		if (hands.left === equip.weaponInstanceId) hands.left = null;
		if (hands.right === equip.weaponInstanceId) hands.right = null;
	} else throw new Error("Invalid weapon equip operation");
}

export function prepareWeaponAttack(encounter: EncounterState, request: AttackRequest): PreparedWeaponAttack {
	if (request.mode !== "melee" && request.mode !== "ranged" && request.mode !== "thrown")
		throw new Error("Invalid weapon attack mode");
	const actor = encounter.definition(request.actorId);
	const crossbowExpert = actor instanceof BaseCharacter && actor.feats.some((feat) => feat.name === "crossbow-expert");
	const sharpshooter = actor instanceof BaseCharacter && actor.feats.some((feat) => feat.name === "sharpshooter");
	const state = encounter.state(request.actorId);
	const instance = selectWeaponInstance(encounter, request);
	const weapon = instance.weapon;
	const expertCrossbow = crossbowExpert && ["hand-crossbow", "light-crossbow", "heavy-crossbow"].includes(weapon.id);
	if (weapon.ammunitionKind && state.resources[`ammunition.${weapon.ammunitionKind}`]?.remaining === 0)
		throw new Error("No ammunition available");
	if (state.spentWeaponInstanceIds.has(instance.id)) throw new Error("Weapon instance has already been thrown");
	const hands = { ...state.hands };
	let manipulationCost = 0;
	const isThrown = request.mode === "thrown" || (request.mode === "ranged" && weapon.properties.includes("thrown"));
	if (request.equip) {
		if (request.equip.when !== "before" && request.equip.when !== "after") throw new Error("Invalid equip timing");
		if (request.equip.hand !== "left" && request.equip.hand !== "right" && request.equip.hand !== "both")
			throw new Error("Invalid equip hand");
		const freeThrownDraw =
			isThrown &&
			request.equip.kind === "draw" &&
			request.equip.when === "before" &&
			request.equip.weaponInstanceId === instance.id;
		if (request.actionSource !== "attack-action" && !freeThrownDraw)
			throw new Error("Weapon equip operation requires an Attack-action attack");
		manipulationCost = freeThrownDraw ? 0 : 1;
		if (request.equip.when === "before") applyEquip(encounter, request.actorId, hands, request.equip);
	}
	if (request.mode === "melee" && weapon.category !== "melee") throw new Error("Not a melee weapon");
	if (request.mode === "ranged" && weapon.category !== "ranged")
		throw new Error("Melee weapons require thrown mode for ranged attacks");
	if (request.mode === "thrown" && !weapon.properties.includes("thrown")) throw new Error("Weapon cannot be thrown");
	if (request.distance !== undefined) {
		if (!Number.isFinite(request.distance) || request.distance < 0) throw new Error("Invalid attack distance");
		if (
			request.mode === "melee" &&
			request.distance >
				weapon.reach +
					(actor instanceof BaseCharacter
						? actor.characterClass.getMeleeReachBonus(
								actor.level,
								weapon,
								encounter.hasActiveTurn && encounter.turn.ownerId === request.actorId,
							)
						: 0)
		)
			throw new Error("Target is beyond melee reach");
		if (request.mode !== "melee" && (!weapon.range || request.distance > weapon.range.long))
			throw new Error("Target is beyond weapon range");
	}
	// Thrown includes drawing that weapon as part of its attack, even outside Attack Action.
	if (isThrown && hands.left !== instance.id && hands.right !== instance.id) {
		const free = hands.left === null ? "left" : hands.right === null ? "right" : null;
		if (!free) throw new Error("No hand available to draw the thrown weapon");
		hands[free] = instance.id;
	}
	if (hands.left !== instance.id && hands.right !== instance.id)
		throw new Error("Weapon must be held before attacking");
	const requiresTwoHands =
		weapon.properties.includes("two-handed") && !(weapon.oneHandedWhenMounted && state.classState.mounted === true);
	const twoHanded = request.grip === "two-handed" || (request.grip === undefined && requiresTwoHands);
	if (request.grip !== undefined && request.grip !== "one-handed" && request.grip !== "two-handed")
		throw new Error("Invalid weapon grip");
	if (requiresTwoHands && !twoHanded) throw new Error("Weapon requires two hands");
	if (twoHanded) {
		if ((hands.left !== null && hands.left !== instance.id) || (hands.right !== null && hands.right !== instance.id))
			throw new Error("Two-handed attack requires both hands available");
		hands.left = instance.id;
		hands.right = instance.id;
	} else if (hands.left === instance.id && hands.right === instance.id) hands.right = null;
	if (
		weapon.properties.includes("ammunition") &&
		!expertCrossbow &&
		!twoHanded &&
		hands.left !== null &&
		hands.right !== null
	)
		throw new Error("One-handed Ammunition weapon requires a free loading hand");
	const attackAbility = selectAbility(encounter, request, weapon);
	const abilityModifier = actor.getStatModifier(attackAbility);
	const proficiency =
		actor instanceof BaseCharacter
			? actor.characterClass.isProficientWithWeapon(weapon)
				? actor.getProficiencyBonus()
				: 0
			: actor.getProficiencyBonus();
	const attackModifiers: TCombatModifier[] = [];
	if (
		actor instanceof BaseCharacter &&
		!actor.armorTrained &&
		(attackAbility === "strength" || attackAbility === "dexterity")
	)
		attackModifiers.push({ source: "armor.untrained", attackRoll: { disadvantage: 1 } });
	if (weapon.properties.includes("heavy") && actor.stats[weapon.category === "melee" ? "strength" : "dexterity"] < 13)
		attackModifiers.push({ source: "weapon.heavy", attackRoll: { disadvantage: 1 } });
	if (
		request.mode !== "melee" &&
		request.distance !== undefined &&
		weapon.range &&
		request.distance > weapon.range.normal &&
		!(sharpshooter && weapon.category === "ranged")
	)
		attackModifiers.push({ source: "weapon.long-range", attackRoll: { disadvantage: 1 } });
	const suppressAbility =
		(request.attackOrigin === "light" ||
			request.attackOrigin === "nick" ||
			request.attackOrigin === "cleave" ||
			request.attackOrigin === "dual-wielder") &&
		!(expertCrossbow && (request.attackOrigin === "light" || request.attackOrigin === "nick"));
	const damageDice =
		request.mode === "melee" && twoHanded && weapon.versatileDamage
			? weapon.versatileDamage
			: weapon.damage.map((die) => die.maxValue);
	let loadingKey: string | undefined;
	if (weapon.properties.includes("loading") && !expertCrossbow) {
		if (!request.actionId) throw new Error("Loading needs an issued action identity");
		loadingKey = JSON.stringify([request.actorId, request.actionId, instance.id]);
	}
	if (isThrown) {
		if (request.equip?.when === "after" && request.equip.weaponInstanceId === instance.id)
			throw new Error("A thrown instance is no longer available for an after-attack equip operation");
		if (hands.left === instance.id) hands.left = null;
		if (hands.right === instance.id) hands.right = null;
	}
	if (request.equip?.when === "after") applyEquip(encounter, request.actorId, hands, request.equip);
	return {
		instance,
		attackAbility,
		attackBonus: request.profile?.attackBonus ?? abilityModifier + proficiency,
		damageComponents: [
			{
				id: "weapon",
				source: `weapon.${weapon.name}`,
				origin: "weapon",
				damageType: weapon.damageType,
				dice: damageDice,
				flatBonus: weapon.flatDamage + (suppressAbility ? Math.min(0, abilityModifier) : abilityModifier),
				doublesOnCrit: true,
			},
		],
		attackModifiers,
		nextHands: hands,
		manipulationCost,
		...(loadingKey === undefined ? {} : { loadingKey }),
		...(isThrown ? { thrownInstanceId: instance.id } : {}),
		limitations: [
			...(weapon.properties.includes("ammunition") &&
			!(weapon.ammunitionKind && state.resources[`ammunition.${weapon.ammunitionKind}`])
				? ["Raw scenario assumes unlimited ammunition"]
				: []),
			...(weapon.weaponMastery === "push" ? ["Weapon Mastery Push is outside the supported scenario"] : []),
		],
	};
}
