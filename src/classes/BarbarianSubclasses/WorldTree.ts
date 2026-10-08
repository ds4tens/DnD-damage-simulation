import Barbarian from "../Barbarian.ts";

/**
 * Path of the World Tree skeleton
 *
 * Добавить Push/Tople и возможно прочие weapon mastery эффкеты как post-hit модификатроы
 */
class WorldTree extends Barbarian {
	override readonly unsupportedFeatures = [
		"World Tree subclass features",
		"Full Rage activation/resources/duration",
		"Configurable Reckless Attack and Brutal Strike decisions",
	];
}

export default WorldTree;
