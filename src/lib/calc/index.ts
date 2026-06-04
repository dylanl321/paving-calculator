// Pure TypeScript calculation engine — all paving math, zero Svelte imports.
// Re-exports all formula functions and adds new pure ETA calculations.

import type { ETAStats, WeatherAdjustedETA } from './types';

// Re-export all types
export * from './types';

// Re-export all formula functions from formulas.ts
export {
	squareYards,
	spreadRatePlaced,
	spreadRateFromThickness,
	feetFromTons,
	actualSpreadRate,
	feetFromLoads,
	feetFromOrderedMinusPlaced,
	tackGallons,
	tonnageToOrder,
	stickCheck,
	soilTonnage,
	soilLbsPerSy,
	compactionPct,
	fieldDryDensity,
	waterToAddGallons,
	concreteVolume,
	subgradeTonnage,
	slopeGrade,
	soilCompaction,
	intersectionArea,
	variableWidthArea
} from '../config/formulas';

// Re-export check functions from config
export { placementCheck, spreadSpecCheck, tackTempCheck, rainCheck } from '../config/index';

// Pure ETA calculation functions

interface LoadData {
	tons: number;
	rejected: boolean;
	timestamp: number;
}

interface DailyForecast {
	date: string;
	precipIn: number;
	precipProbabilityMax: number;
}

/**
 * Calculate ETA statistics from load history.
 * Pure function — no store/Svelte imports.
 */
export function calcETAStats(
	loads: LoadData[],
	targetTonnage: number | null
): ETAStats {
	const acceptedLoads = loads.filter((l) => !l.rejected);

	// Calculate total tons
	const totalTons = acceptedLoads.reduce((sum, l) => sum + l.tons, 0);

	// Group by calendar day to count distinct days worked
	const daySet = new Set<string>();
	for (const load of acceptedLoads) {
		const date = new Date(load.timestamp * 1000);
		const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
		daySet.add(dateKey);
	}
	const daysWorked = daySet.size;

	// Calculate average tons per day
	const avgTonsPerDay = daysWorked > 0 ? totalTons / daysWorked : 0;

	// Calculate remaining tonnage
	const remainingTons =
		targetTonnage && targetTonnage > 0 ? Math.max(0, targetTonnage - totalTons) : null;

	// Calculate days remaining
	const daysRemaining =
		remainingTons != null && avgTonsPerDay > 0
			? Math.ceil(remainingTons / avgTonsPerDay)
			: null;

	// Calculate projected completion date
	let projectedDate: Date | null = null;
	if (daysRemaining != null && daysRemaining > 0) {
		projectedDate = new Date();
		projectedDate.setDate(projectedDate.getDate() + daysRemaining);
	}

	// Check if job is complete
	const isComplete = remainingTons != null && remainingTons <= 0;

	return {
		totalTons,
		daysWorked,
		avgTonsPerDay,
		remainingTons,
		daysRemaining,
		projectedDate,
		isComplete
	};
}

/**
 * Calculate weather-adjusted ETA by excluding rain days from forecast.
 * Pure function — no store/Svelte imports.
 */
export function calcWeatherAdjustedETA(
	daysRemaining: number,
	dailyForecast: DailyForecast[],
	rainThresholdIn: number
): WeatherAdjustedETA {
	const rainProbThreshold = 60;
	const maxForecastDays = 10;

	// Start from tomorrow
	let currentDate = new Date();
	currentDate.setDate(currentDate.getDate() + 1);
	currentDate.setHours(0, 0, 0, 0);

	let workDaysRemaining = daysRemaining;
	let rainDaysExcluded = 0;
	let forecastDaysUsed = 0;

	while (workDaysRemaining > 0 && forecastDaysUsed < maxForecastDays) {
		const dateKey = currentDate.toISOString().split('T')[0];
		const forecast = dailyForecast.find((f) => f.date === dateKey);

		forecastDaysUsed++;

		if (forecast) {
			const isRainDay =
				forecast.precipIn >= rainThresholdIn ||
				forecast.precipProbabilityMax >= rainProbThreshold;
			if (isRainDay) {
				rainDaysExcluded++;
			} else {
				workDaysRemaining--;
			}
		} else {
			// No forecast data for this day, assume it's a working day
			workDaysRemaining--;
		}

		currentDate.setDate(currentDate.getDate() + 1);
	}

	const adjustedDate = workDaysRemaining <= 0 ? currentDate : null;
	const forecastExceeded = workDaysRemaining > 0;

	return {
		adjustedDate,
		rainDaysExcluded,
		forecastExceeded
	};
}
