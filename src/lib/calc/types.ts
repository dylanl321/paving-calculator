// Pure TypeScript types for the calculation engine.
// Extracted from calcContext and config to create a framework-agnostic calc layer.

export type CalcValueSource =
	| 'config'
	| 'weather_api'
	| 'gps'
	| 'manual'
	| 'derived'
	| 'job_site';

export interface CalcValue<T> {
	value: T;
	source: CalcValueSource;
	updatedAt: number;
	specRef?: string;
}

// Result types from formulas

export type SpreadSpecStatus = 'good' | 'warn' | 'bad';

export interface SpreadSpecCheck {
	status: SpreadSpecStatus;
	toleranceLbsSy: number;
	deltaLbsSy: number;
	label: string;
	courseLabel: string;
	message: string;
	clause: string;
	clauseTitle: string;
	guidance?: string;
}

export type PlacementStatus = 'pass' | 'warn' | 'fail';

export interface PlacementCheck {
	status: PlacementStatus;
	minTempF: number;
	message: string;
	clause: string;
	clauseTitle: string;
	guidance?: string;
}

export interface RainCheck {
	status: PlacementStatus;
	totalIn: number;
	message: string;
	clause: string;
	clauseTitle: string;
	guidance?: string;
}

export interface TackTempCheck {
	status: PlacementStatus;
	message: string;
	clause: string;
	clauseTitle: string;
	guidance?: string;
}

// ETA calculation result types

export interface ETAStats {
	totalTons: number;
	daysWorked: number;
	avgTonsPerDay: number;
	remainingTons: number | null;
	daysRemaining: number | null;
	projectedDate: Date | null;
	isComplete: boolean;
}

export interface WeatherAdjustedETA {
	adjustedDate: Date | null;
	rainDaysExcluded: number;
	forecastExceeded: boolean;
}
