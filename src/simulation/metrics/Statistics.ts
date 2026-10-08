export type Estimate = {
	sampleCount: number;
	mean: number;
	sampleStandardDeviation: number | null;
	standardError: number | null;
	confidenceInterval95: { lower: number; upper: number; method: "approximate-student-t" } | null;
};

// NIST, 0.975 quantiles, checked 2026-10-08:
// https://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm
const smallSampleCriticals = [
	12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11,
	2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
] as const;

function critical95(degreesOfFreedom: number): number {
	const tabulated = smallSampleCriticals[degreesOfFreedom - 1];
	if (tabulated !== undefined) return tabulated;
	// Large-df expansion; the interval is explicitly an approximation.
	const z = 1.959963984540054;
	const v = degreesOfFreedom;
	return (
		z +
		(z ** 3 + z) / (4 * v) +
		(5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * v ** 2) +
		(3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * v ** 3)
	);
}

/** Independent trials are the observations, never correlated turns of one day. */
export function estimate(values: readonly number[]): Estimate {
	if (values.length === 0) throw new Error("An estimate requires at least one observation");
	let mean = 0;
	let squaredDeviations = 0;
	values.forEach((value, index) => {
		if (!Number.isFinite(value)) throw new Error("Observations must be finite");
		const delta = value - mean;
		mean += delta / (index + 1);
		squaredDeviations += delta * (value - mean);
	});
	if (values.length === 1)
		return { sampleCount: 1, mean, sampleStandardDeviation: null, standardError: null, confidenceInterval95: null };
	const sampleStandardDeviation = Math.sqrt(Math.max(0, squaredDeviations) / (values.length - 1));
	const standardError = sampleStandardDeviation / Math.sqrt(values.length);
	const margin = critical95(values.length - 1) * standardError;
	return {
		sampleCount: values.length,
		mean,
		sampleStandardDeviation,
		standardError,
		confidenceInterval95: { lower: mean - margin, upper: mean + margin, method: "approximate-student-t" },
	};
}
