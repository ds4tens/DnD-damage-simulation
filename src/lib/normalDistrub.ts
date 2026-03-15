/**
 * Генерирует случайное число с нормальным распределением
 * @param mean - среднее значение (математическое ожидание)
 * @param stdDev - стандартное отклонение
 * @returns случайное число с нормальным распределением
 */
function normalDistribution(mean: number = 0, stdDev: number = 1): number {
	const u1 = Math.random();
	const u2 = Math.random();

	const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

	return z0 * stdDev + mean;
}

/**
 * Генерирует случайное число с нормальным распределением в заданном диапазоне
 * @param min - минимальное значение
 * @param max - максимальное значение
 * @param mean - среднее значение (по умолчанию центр диапазона)
 * @param stdDev - стандартное отклонение (по умолчанию 1/6 от диапазона)
 * @returns случайное число в диапазоне [min, max]
 */
function normalDistributionInRange(min: number, max: number, mean?: number, stdDev?: number): number {
	const range = max - min;
	const defaultMean = min + range / 2;
	const defaultStdDev = range / 6; // 99.7% значений попадут в диапазон ±3σ

	const m = mean ?? defaultMean;
	const sd = stdDev ?? defaultStdDev;

	let value: number;
	// Повторяем генерацию, пока значение не попадет в диапазон
	do {
		value = normalDistribution(m, sd);
	} while (value < min || value > max);

	return Math.round(value);
}

export { normalDistributionInRange };
