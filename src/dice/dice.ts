import type { DiceRoller } from "./RandomSource.ts";
import { validateSides } from "./RandomSource.ts";

/** Immutable die description; every roll requires an explicit encounter source. */
class Dice {
	constructor(readonly maxValue: number) {
		validateSides(maxValue);
	}
	roll(roller: DiceRoller): number {
		return roller.roll(this.maxValue);
	}
}
export default Dice;
