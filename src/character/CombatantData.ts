import type { DamageDefenses, DamageType } from "../combat/DamageTypes.ts";
import type { TStatsType } from "./BaseCharacter.ts";

export const abilityNames: readonly TStatsType[] = [
	"strength",
	"dexterity",
	"constitution",
	"intelligence",
	"wisdom",
	"charisma",
];
export const damageTypeNames: readonly DamageType[] = [
	"acid",
	"bludgeoning",
	"cold",
	"fire",
	"force",
	"lightning",
	"necrotic",
	"piercing",
	"poison",
	"psychic",
	"radiant",
	"slashing",
	"thunder",
];
export type CombatantOptions = {
	savingThrowProficiencies?: readonly TStatsType[];
	/** A full static save bonus, including any ability and proficiency bonuses. */
	savingThrowBonuses?: Partial<Record<TStatsType, number>>;
	defenses?: Partial<DamageDefenses>;
	medicineProficient?: boolean;
};
export function combatantData(options: CombatantOptions, defaultProficiencies: readonly TStatsType[] = []) {
	if (options.medicineProficient !== undefined && typeof options.medicineProficient !== "boolean")
		throw new Error("Invalid Medicine proficiency");
	const proficiencies = [...(options.savingThrowProficiencies ?? defaultProficiencies)];
	if (
		proficiencies.some((ability) => !abilityNames.includes(ability)) ||
		new Set(proficiencies).size !== proficiencies.length
	)
		throw new Error("Invalid saving throw proficiencies");
	const bonuses = { ...options.savingThrowBonuses };
	for (const [ability, bonus] of Object.entries(bonuses))
		if (!abilityNames.includes(ability as TStatsType) || !Number.isFinite(bonus))
			throw new Error("Invalid saving throw bonus");

	const defenses: DamageDefenses = {
		resistances: Object.freeze([...(options.defenses?.resistances ?? [])]),
		immunities: Object.freeze([...(options.defenses?.immunities ?? [])]),
		vulnerabilities: Object.freeze([...(options.defenses?.vulnerabilities ?? [])]),
	};
	for (const types of Object.values(defenses))
		if (types.some((type) => !damageTypeNames.includes(type))) throw new Error("Invalid damage defense");
	return {
		savingThrowProficiencies: Object.freeze(proficiencies),
		savingThrowBonuses: Object.freeze(bonuses),
		defenses: Object.freeze(defenses),
		medicineProficient: options.medicineProficient ?? false,
	};
}
