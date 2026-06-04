// Shared calculator context with source metadata.
// Aggregates inputs from weather, job, and manual overrides — tracks where each
// value originated (API, GPS, manual, job site config) so calculators can show
// provenance and let crews override individual fields without losing the underlying
// reactive connection to weather/job stores.

import { weather } from './weather.svelte';
import { job } from './job.svelte';
import { orgSettingsStore } from './orgSettings.svelte';

const STORAGE_KEY = 'paverate.calcContext.manuals.v1';

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

type CalcField = 'air_temp' | 'wind_speed' | 'road_width' | 'lift_thickness' | 'course_type';

interface ManualOverrides {
	air_temp?: { value: number; updatedAt: number };
	wind_speed?: { value: number; updatedAt: number };
	road_width?: { value: number; updatedAt: number };
	lift_thickness?: { value: number; updatedAt: number };
	course_type?: { value: string; updatedAt: number };
}

interface JobSiteDefaults {
	road_width?: number;
	lift_thickness?: number;
	course_type?: string;
}

function loadManuals(): ManualOverrides {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

class CalcContext {
	#manuals = $state<ManualOverrides>({});
	#jobSiteDefaults = $state<JobSiteDefaults>({});

	constructor() {
		if (typeof localStorage !== 'undefined') {
			this.#manuals = loadManuals();
		}
	}

	get air_temp(): CalcValue<number | null> {
		const manual = this.#manuals.air_temp;
		if (manual) {
			return {
				value: manual.value,
				source: 'manual',
				updatedAt: manual.updatedAt
			};
		}
		return {
			value: weather.effectiveTempF,
			source: weather.useManualTemp ? 'manual' : 'weather_api',
			updatedAt: weather.lastFetchedAt ?? Date.now()
		};
	}

	get wind_speed(): CalcValue<number | null> {
		const manual = this.#manuals.wind_speed;
		if (manual) {
			return {
				value: manual.value,
				source: 'manual',
				updatedAt: manual.updatedAt
			};
		}
		// Not yet in weather store; defaults to null with source 'weather_api'
		return {
			value: null,
			source: 'weather_api',
			updatedAt: weather.lastFetchedAt ?? Date.now()
		};
	}

	get road_width(): CalcValue<number> {
		const manual = this.#manuals.road_width;
		if (manual) {
			return {
				value: manual.value,
				source: 'manual',
				updatedAt: manual.updatedAt
			};
		}
		const jobSiteDefault = this.#jobSiteDefaults.road_width;
		if (jobSiteDefault != null) {
			return {
				value: jobSiteDefault,
				source: 'job_site',
				updatedAt: Date.now()
			};
		}
		return {
			value: job.widthFt,
			source: 'job_site',
			updatedAt: Date.now()
		};
	}

	get lift_thickness(): CalcValue<number> {
		const manual = this.#manuals.lift_thickness;
		if (manual) {
			return {
				value: manual.value,
				source: 'manual',
				updatedAt: manual.updatedAt
			};
		}
		const jobSiteDefault = this.#jobSiteDefaults.lift_thickness;
		if (jobSiteDefault != null) {
			return {
				value: jobSiteDefault,
				source: 'job_site',
				updatedAt: Date.now()
			};
		}
		return {
			value: job.thicknessIn,
			source: 'job_site',
			updatedAt: Date.now()
		};
	}

	get course_type(): CalcValue<string> {
		const manual = this.#manuals.course_type;
		if (manual) {
			return {
				value: manual.value,
				source: 'manual',
				updatedAt: manual.updatedAt
			};
		}
		const jobSiteDefault = this.#jobSiteDefaults.course_type;
		if (jobSiteDefault != null) {
			return {
				value: jobSiteDefault,
				source: 'job_site',
				updatedAt: Date.now()
			};
		}
		return {
			value: job.courseType,
			source: 'job_site',
			updatedAt: Date.now()
		};
	}

	setManual(field: CalcField, value: number | string) {
		const now = Date.now();
		if (field === 'air_temp' || field === 'wind_speed' || field === 'road_width' || field === 'lift_thickness') {
			this.#manuals[field] = { value: value as number, updatedAt: now };
		} else if (field === 'course_type') {
			this.#manuals[field] = { value: value as string, updatedAt: now };
		}
		this.#save();
	}

	clearManual(field: CalcField) {
		delete this.#manuals[field];
		this.#save();
	}

	clearAllManuals() {
		this.#manuals = {};
		this.#save();
	}

	hasManual(field: CalcField): boolean {
		return field in this.#manuals;
	}

	seedFromJobSite(config: {
		lane_width_ft?: number | null;
		target_thickness_in?: number | null;
		// course_type is a TOLERANCE.* id (not mix_type which is a human-readable label).
		// Only seed if the API returns it explicitly.
		course_type?: string | null;
	} | null) {
		if (!config) {
			this.clearJobSite();
			return;
		}
		const defaults: JobSiteDefaults = {};
		if (config.lane_width_ft != null && config.lane_width_ft > 0) {
			defaults.road_width = config.lane_width_ft;
		}
		if (config.target_thickness_in != null && config.target_thickness_in > 0) {
			defaults.lift_thickness = config.target_thickness_in;
		}
		if (config.course_type != null && config.course_type.trim() !== '') {
			defaults.course_type = config.course_type;
		}
		this.#jobSiteDefaults = defaults;
	}

	clearJobSite() {
		this.#jobSiteDefaults = {};
	}

	get orgDefaults() {
		return orgSettingsStore.resolvedDefaults;
	}

	#save() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#manuals));
		} catch {
			// ignore
		}
	}
}

export const calcContext = new CalcContext();
