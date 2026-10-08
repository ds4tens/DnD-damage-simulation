export interface DiceRoller {
	roll(sides: number): number;
}

export function validateSides(sides: number): void {
	if (!Number.isSafeInteger(sides) || sides < 1) throw new Error(`Invalid die size: ${sides}`);
}

/** Ordinary dice are uniform; randomness is injected only at this boundary. */
export class UniformDiceRoller implements DiceRoller {
	constructor(private readonly random: () => number = Math.random) {}
	roll(sides: number): number {
		validateSides(sides);
		const value = this.random();
		if (!Number.isFinite(value) || value < 0 || value >= 1)
			throw new Error("Random source must return a value in [0, 1)");
		return Math.floor(value * sides) + 1;
	}
}

/** Mulberry32, unsigned 32-bit integer seed. Version this algorithm before changing it. */
export class SeededDiceRoller extends UniformDiceRoller {
	constructor(seed: number) {
		if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
			throw new Error("Seed must be an unsigned 32-bit integer");
		let state = seed >>> 0;
		super(() => {
			state = (state + 0x6d2b79f5) >>> 0;
			let value = Math.imul(state ^ (state >>> 15), 1 | state);
			value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
			return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
		});
	}
}

export type FixedRoll = number | { sides: number; value: number };
export class FixedDiceRoller implements DiceRoller {
	private index = 0;
	private readonly values: readonly FixedRoll[];
	constructor(values: readonly FixedRoll[]) {
		this.values = values.map((value) => (typeof value === "number" ? value : { ...value }));
	}
	get remaining(): number {
		return this.values.length - this.index;
	}
	roll(sides: number): number {
		validateSides(sides);
		const entry = this.values[this.index];
		if (entry === undefined) throw new Error("Fixed dice sequence exhausted");
		const value = typeof entry === "number" ? entry : entry.value;
		if (typeof entry !== "number" && entry.sides !== sides)
			throw new Error(`Expected d${entry.sides}, requested d${sides}`);
		if (!Number.isSafeInteger(value) || value < 1 || value > sides)
			throw new Error(`Invalid fixed roll ${value} for d${sides}`);
		this.index++;
		return value;
	}
}
