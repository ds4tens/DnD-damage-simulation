import type { JsonValue } from "./SimulationTypes.ts";

/** Reject missing/functions/nonfinite metadata instead of silently losing reproduction inputs. */
export function toJson(value: unknown): JsonValue {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (Array.isArray(value)) return value.map(toJson);
	if (typeof value === "object" && value !== null) {
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) throw new Error("Metadata must contain plain objects");
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
				.map(([key, child]) => [key, toJson(child)]),
		);
	}
	throw new Error("Metadata must be finite JSON data");
}

export function canonicalJson(value: unknown): string {
	return JSON.stringify(toJson(value));
}
