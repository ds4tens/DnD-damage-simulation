import type { TPostHitContext } from "../../combat/CombatTypes.ts";
import type { TCombatModifier } from "../../modifiers/Modifiers.ts";
import Barbarian from "../Barbarian.ts";

/** Ram requires target size and an explicit optional-feature decision; not supported yet. */
class WildHeart extends Barbarian {
	override readonly unsupportedFeatures = [
		"Full Rage activation/resources/duration",
		"Configurable Reckless Attack and Brutal Strike decisions",
		"Wild Heart Ram",
	];
	override getPostHitModifiers(_ctx: TPostHitContext): TCombatModifier[] {
		return [];
	}
}
export default WildHeart;
