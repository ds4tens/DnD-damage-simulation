import Dice from "../../dice/dice.ts";
import Weapon from "../Weapon.ts";
import { EWeaponMastery } from "./WeaponMastery.ts";

/** PHB 2024 p.215 — 1d8 slashing one-handed; versatile 1d10 two-handed. Mastery: Topple. */
export const Battleaxe = new Weapon(
	"Battleaxe",
	"Martial Weapon, Melee Weapon. Versatile — one-handed melee 1d8, two-handed melee 1d10 (parenthetical damage applies when wielding with two hands). " +
		"Mastery: Topple — on a hit you can force the target to make a Constitution saving throw (DC 8 plus the ability modifier used for the attack roll and your Proficiency Bonus); on a failed save the target has the Prone condition. " +
		"Source: PHB 2024, page 215; SRD 5.2.1 and Basic Rules (5.5e/2024).",
	"martial",
	"common",
	10,
	4,
	"medium",
	[new Dice(8)],
	"slashing",
	EWeaponMastery.TOPPLE,
	{ category: "melee", properties: ["versatile"] },
);

/** XPHB p.215 / PHB-style 2024 — simple light melee 1d4 bludgeoning. Mastery: Slow. */
// export const Club = new Weapon(
// 	"Club",
// 	"Simple Weapon, Melee Weapon. Light. Mastery: Slow (see Weapon Mastery, PHB 2024 / XPHB). " +
// 		"Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 10 cp (1 sp).",
// 	"simple",
// 	"none",
// 	10,
// 	2,
// 	"light",
// 	[new Dice(4)],
// 	"bludgeoning",
// );

/** XPHB p.215 — simple finesse/light/thrown weapon, 1d4 piercing (thrown range 20/60). Mastery: Nick. */
// export const Dagger = new Weapon(
// 	"Dagger",
// 	"Simple Weapon, Melee or Ranged weapon. Finesse, Light, Thrown — thrown range normally 20 ft / 60 ft (normal / long). Mastery: Nick (Weapon Mastery, PHB / XPHB). " +
// 		"Reference sources also: DrDe-TFV, DrDe-TWoO. Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 200 cp (2 gp).",
// 	"simple",
// 	"none",
// 	200,
// 	1,
// 	"light",
// 	[new Dice(4)],
// 	"piercing",
// );

/** XPHB p.215 — martial two-handed melee polearm with reach; 1d10 slashing. Mastery: Graze. */
export const Glaive = new Weapon(
	"Glaive",
	"Martial Weapon, Melee Weapon. Heavy, Reach, Two-Handed. Melee reach with this weapon normally includes an extra 5 ft (Reach property). Damage 1d10 slashing using two hands. Mastery: Graze (Weapon Mastery, PHB / XPHB). " +
		"Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 2000 cp (20 gp).",
	"martial",
	"none",
	2000,
	6,
	"large",
	[new Dice(10)],
	"slashing",
	EWeaponMastery.GRAZE,
	{ category: "melee", properties: ["heavy", "reach", "two-handed"], reach: 10 },
);

/** XPHB p.215 — martial heavy two-handed melee axe; 1d12 slashing. Mastery: Cleave. */
// export const Greataxe = new Weapon(
// 	"Greataxe",
// 	"Martial Weapon, Melee Weapon. Heavy, Two-Handed. Damage 1d12 slashing using two hands. Mastery: Cleave (Weapon Mastery, PHB / XPHB). " +
// 		"Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 3000 cp (30 gp).",
// 	"martial",
// 	"none",
// 	3000,
// 	7,
// 	"large",
// 	[new Dice(12)],
// 	"slashing",
// );

/** XPHB p.215 — simple two-handed melee club; 1d8 bludgeoning. Mastery: Push. */
// export const Greatclub = new Weapon(
// 	"Greatclub",
// 	"Simple Weapon, Melee Weapon. Two-Handed — damage is 1d8 bludgeoning when used with both hands on a melee attack. Mastery: Push (Weapon Mastery, PHB / XPHB). " +
// 		"Reference source also: DrDe-BD. Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 20 cp (2 sp).",
// 	"simple",
// 	"none",
// 	20,
// 	10,
// 	"large",
// 	[new Dice(8)],
// 	"bludgeoning",
// );

/** XPHB p.215 — martial heavy two-handed melee sword; 2d6 slashing. Mastery: Graze. */
export const Greatsword = new Weapon(
	"Greatsword",
	"Martial Weapon, Melee Weapon. Heavy, Two-Handed. Damage 2d6 slashing using two hands. Mastery: Graze (Weapon Mastery, PHB / XPHB). " +
		"Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 5000 cp (50 gp).",
	"martial",
	"none",
	5000,
	6,
	"large",
	[new Dice(6), new Dice(6)],
	"slashing",
	EWeaponMastery.GRAZE,
	{ category: "melee", properties: ["heavy", "two-handed"] },
);

/** XPHB p.215 — martial heavy two-handed polearm with reach; 1d10 slashing. Mastery: Cleave. */
// export const Halberd = new Weapon(
// 	"Halberd",
// 	"Martial Weapon, Melee Weapon. Heavy, Reach, Two-Handed. Melee reach with this weapon normally includes an extra 5 ft (Reach property). Damage 1d10 slashing using two hands. Mastery: Cleave (Weapon Mastery, PHB / XPHB). " +
// 		"Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 2000 cp (20 gp).",
// 	"martial",
// 	"none",
// 	2000,
// 	6,
// 	"large",
// 	[new Dice(10)],
// 	"slashing",
// );

/** XPHB p.215 — simple light throwable hand axe; melee or thrown 1d6 slashing (20/60). Mastery: Vex. */
// export const Handaxe = new Weapon(
// 	"Handaxe",
// 	"Simple Weapon, Melee or Ranged weapon. Light, Thrown — thrown range normally 20 ft / 60 ft (normal / long). Damage is 1d6 slashing. Mastery: Vex (Weapon Mastery, PHB / XPHB). " +
// 		"Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 500 cp (5 gp).",
// 	"simple",
// 	"none",
// 	500,
// 	2,
// 	"light",
// 	[new Dice(6)],
// 	"slashing",
// );

/** XPHB p.215 — simple light throwable hammer; melee or thrown 1d4 bludgeoning (20/60). Mastery: Nick. */
// export const LightHammer = new Weapon(
// 	"Light Hammer",
// 	"Simple Weapon, Melee or Ranged weapon. Light, Thrown — thrown range normally 20 ft / 60 ft (normal / long). Damage is 1d4 bludgeoning. Mastery: Nick (Weapon Mastery, PHB / XPHB). " +
// 		"Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 200 cp (2 gp).",
// 	"simple",
// 	"none",
// 	200,
// 	2,
// 	"light",
// 	[new Dice(4)],
// 	"bludgeoning",
// );

/** XPHB p.215 — martial versatile melee sword; 1d8 / 1d10 slashing (one / two hands). Mastery: Sap. */
// export const Longsword = new Weapon(
// 	"Longsword",
// 	"Martial Weapon, Melee Weapon. Versatile — one-handed melee 1d8 slashing, two-handed melee 1d10 slashing (parenthetical damage applies when wielding with two hands). Mastery: Sap (Weapon Mastery, PHB / XPHB). " +
// 		"Reference source also: HotB. Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 1500 cp (15 gp).",
// 	"martial",
// 	"none",
// 	1500,
// 	3,
// 	"medium",
// 	[new Dice(8)],
// 	"slashing",
// );

/** XPHB p.215 — simple one-handed melee mace; 1d6 bludgeoning. Mastery: Sap. */
// export const Mace = new Weapon(
// 	"Mace",
// 	"Simple Weapon, Melee Weapon. Damage 1d6 bludgeoning. Mastery: Sap (Weapon Mastery, PHB / XPHB). " +
// 		"Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 500 cp (5 gp).",
// 	"simple",
// 	"none",
// 	500,
// 	4,
// 	"medium",
// 	[new Dice(6)],
// 	"bludgeoning",
// );

/** XPHB p.215 — martial heavy two-handed hammer; 2d6 bludgeoning. Mastery: Topple. */
export const Maul = new Weapon(
	"Maul",
	"Martial Weapon, Melee Weapon. Heavy, Two-Handed. Damage 2d6 bludgeoning using two hands. Mastery: Topple (Weapon Mastery, PHB / XPHB). " +
		"Reference source also: HotB. Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 1000 cp (10 gp).",
	"martial",
	"none",
	1000,
	10,
	"large",
	[new Dice(6), new Dice(6)],
	"bludgeoning",
	EWeaponMastery.TOPPLE,
	{ category: "melee", properties: ["heavy", "two-handed"] },
);

/** XPHB p.215 — martial one-handed morningstar; 1d8 piercing. Mastery: Sap. */
// export const Morningstar = new Weapon(
// 	"Morningstar",
// 	"Martial Weapon, Melee Weapon. Damage 1d8 piercing. Mastery: Sap (Weapon Mastery, PHB / XPHB). " +
// 		"Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 1500 cp (15 gp).",
// 	"martial",
// 	"none",
// 	1500,
// 	4,
// 	"medium",
// 	[new Dice(8)],
// 	"piercing",
// );

/** XPHB p.215 — martial heavy two-handed reach polearm; 1d10 piercing. Mastery: Push. */
// export const Pike = new Weapon(
// 	"Pike",
// 	"Martial Weapon, Melee Weapon. Heavy, Reach, Two-Handed. Melee reach with this weapon normally includes an extra 5 ft (Reach property). Damage 1d10 piercing using two hands. Mastery: Push (Weapon Mastery, PHB / XPHB). " +
// 		"Source: XPHB, page 215; SRD 5.2.1 and Basic Rules (2024). Value 500 cp (5 gp).",
// 	"martial",
// 	"none",
// 	500,
// 	18,
// 	"large",
// 	[new Dice(10)],
// 	"piercing",
// );
