import assert from "node:assert/strict";
import test from "node:test";
import { estimate } from "./Statistics.ts";

test("estimates use sample variance and independent-observation Student-t uncertainty", () => {
	const result = estimate([2, 4, 6]);
	assert.equal(result.mean, 4);
	assert.equal(result.sampleStandardDeviation, 2);
	assert.equal(result.standardError, 2 / Math.sqrt(3));
	assert.ok(result.confidenceInterval95);
	assert.equal(result.confidenceInterval95.upper, 4 + (4.303 * 2) / Math.sqrt(3));
	assert.equal(result.confidenceInterval95.lower, 4 - (4.303 * 2) / Math.sqrt(3));
	assert.equal(result.confidenceInterval95.method, "approximate-student-t");
});

test("one observation has unavailable uncertainty; constants have zero uncertainty", () => {
	assert.deepEqual(estimate([7]), {
		sampleCount: 1,
		mean: 7,
		sampleStandardDeviation: null,
		standardError: null,
		confidenceInterval95: null,
	});
	assert.equal(estimate([7, 7]).sampleStandardDeviation, 0);
	assert.deepEqual(estimate([7, 7]).confidenceInterval95, { lower: 7, upper: 7, method: "approximate-student-t" });
	assert.throws(() => estimate([]));
	assert.throws(() => estimate([1, Number.NaN]));
});

test("large-sample critical approaches the normal limit without replacing small samples", () => {
	const result = estimate(Array.from({ length: 101 }, (_, index) => index % 2));
	assert.ok(result.confidenceInterval95 && result.standardError);
	const critical = (result.confidenceInterval95.upper - result.mean) / result.standardError;
	assert.ok(Math.abs(critical - 1.98397) < 0.00001);
});
