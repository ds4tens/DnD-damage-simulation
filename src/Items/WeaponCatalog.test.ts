import assert from "node:assert/strict";
import test from "node:test";
import { weaponCatalog } from "./Weapon/WeaponList.ts";

/** Independent compact oracle transcribed from Basic Rules 2024 Equipment, verified
 * 2026-10-08 against SRD 5.2.1 pp.90–91 and PHB errata v2.0. No rules prose copied.
 * Columns: name; category; proficiency; dice/constant; type; mastery; properties;
 * range; versatile dice; ammunition; pounds; GP.
 */
const expected = [
	"Club;melee;simple;4;bludgeoning;slow;light;;;;2;0.1",
	"Dagger;melee;simple;4;piercing;nick;finesse,light,thrown;20/60;;;1;2",
	"Greatclub;melee;simple;8;bludgeoning;push;two-handed;;;;10;0.2",
	"Handaxe;melee;simple;6;slashing;vex;light,thrown;20/60;;;2;5",
	"Javelin;melee;simple;6;piercing;slow;thrown;30/120;;;2;0.5",
	"Light Hammer;melee;simple;4;bludgeoning;nick;light,thrown;20/60;;;2;2",
	"Mace;melee;simple;6;bludgeoning;sap;;;;;4;5",
	"Quarterstaff;melee;simple;6;bludgeoning;topple;versatile;;8;;4;0.2",
	"Sickle;melee;simple;4;slashing;nick;light;;;;2;1",
	"Spear;melee;simple;6;piercing;sap;thrown,versatile;20/60;8;;3;1",
	"Dart;ranged;simple;4;piercing;vex;finesse,thrown;20/60;;;0.25;0.05",
	"Light Crossbow;ranged;simple;8;piercing;slow;ammunition,loading,two-handed;80/320;;bolt;5;25",
	"Shortbow;ranged;simple;6;piercing;vex;ammunition,two-handed;80/320;;arrow;2;25",
	"Sling;ranged;simple;4;bludgeoning;slow;ammunition;30/120;;bullet;0;0.1",
	"Battleaxe;melee;martial;8;slashing;topple;versatile;;10;;4;10",
	"Flail;melee;martial;8;bludgeoning;sap;;;;;2;10",
	"Glaive;melee;martial;10;slashing;graze;heavy,reach,two-handed;;;;6;20",
	"Greataxe;melee;martial;12;slashing;cleave;heavy,two-handed;;;;7;30",
	"Greatsword;melee;martial;6,6;slashing;graze;heavy,two-handed;;;;6;50",
	"Halberd;melee;martial;10;slashing;cleave;heavy,reach,two-handed;;;;6;20",
	"Lance;melee;martial;10;piercing;topple;heavy,reach,two-handed;;;;6;10",
	"Longsword;melee;martial;8;slashing;sap;versatile;;10;;3;15",
	"Maul;melee;martial;6,6;bludgeoning;topple;heavy,two-handed;;;;10;10",
	"Morningstar;melee;martial;8;piercing;sap;;;;;4;15",
	"Pike;melee;martial;10;piercing;push;heavy,reach,two-handed;;;;18;5",
	"Rapier;melee;martial;8;piercing;vex;finesse;;;;2;25",
	"Scimitar;melee;martial;6;slashing;nick;finesse,light;;;;3;25",
	"Shortsword;melee;martial;6;piercing;vex;finesse,light;;;;2;10",
	"Trident;melee;martial;8;piercing;topple;thrown,versatile;20/60;10;;4;5",
	"Warhammer;melee;martial;8;bludgeoning;push;versatile;;10;;5;15",
	"War Pick;melee;martial;8;piercing;sap;versatile;;10;;2;5",
	"Whip;melee;martial;4;slashing;slow;finesse,reach;;;;3;2",
	"Blowgun;ranged;martial;flat:1;piercing;vex;ammunition,loading;25/100;;needle;1;10",
	"Hand Crossbow;ranged;martial;6;piercing;vex;ammunition,light,loading;30/120;;bolt;3;75",
	"Heavy Crossbow;ranged;martial;10;piercing;push;ammunition,heavy,loading,two-handed;100/400;;bolt;18;50",
	"Longbow;ranged;martial;8;piercing;slow;ammunition,heavy,two-handed;150/600;;arrow;2;50",
	"Musket;ranged;martial;12;piercing;slow;ammunition,loading,two-handed;40/120;;bullet;10;500",
	"Pistol;ranged;martial;10;piercing;vex;ammunition,loading;30/90;;bullet;3;250",
];

test("all 38 weapons match the independent published table oracle", () => {
	const actual = weaponCatalog.map((weapon) =>
		[
			weapon.name,
			weapon.category,
			weapon.proficiencyCategory,
			weapon.damage.length ? weapon.damage.map((die) => die.maxValue).join(",") : `flat:${weapon.flatDamage}`,
			weapon.damageType,
			weapon.weaponMastery,
			[...weapon.properties].sort().join(","),
			weapon.range ? `${weapon.range.normal}/${weapon.range.long}` : "",
			weapon.versatileDamage?.join(",") ?? "",
			weapon.ammunitionKind ?? "",
			weapon.weight,
			weapon.price,
		].join(";"),
	);
	assert.deepEqual(actual, expected);
	assert.equal(new Set(weaponCatalog.map((weapon) => weapon.id)).size, 38);
	assert.ok(!weaponCatalog.some((weapon) => weapon.name === "Net"));
	assert.equal(
		weaponCatalog
			.filter((weapon) => weapon.oneHandedWhenMounted)
			.map((weapon) => weapon.name)
			.join(),
		"Lance",
	);
	for (const weapon of weaponCatalog) assert.equal(weapon.reach, weapon.properties.includes("reach") ? 10 : 5);
});
