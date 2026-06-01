// Job-site weather: location, live conditions, 24h rain forecast.
// Persisted to localStorage; fetches from Open-Meteo when online.
import { weatherConfig } from '$lib/config';
import {
	fetchWeather,
	formatLocation,
	getCurrentPosition,
	reverseGeocode,
	searchPlaces,
	type GeoResult,
	type RainHour,
	type WeatherSnapshot
} from '$lib/services/weather';

const STORAGE_KEY = 'paverate.weather.v1';

export interface WeatherState {
	lat: number | null;
	lng: number | null;
	locationLabel: string;
	airTempF: number | null;
	conditions: string;
	isRaining: boolean;
	rainNext24hIn: number | null;
	rainHours: RainHour[];
	manualTempF: number | null;
	useManualTemp: boolean;
	lastFetchedAt: number | null;
}

function initial(): WeatherState {
	return {
		lat: null,
		lng: null,
		locationLabel: '',
		airTempF: null,
		conditions: '',
		isRaining: false,
		rainNext24hIn: null,
		rainHours: [],
		manualTempF: null,
		useManualTemp: false,
		lastFetchedAt: null
	};
}

function load(): WeatherState {
	if (typeof localStorage === 'undefined') return initial();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return initial();
		return { ...initial(), ...JSON.parse(raw) };
	} catch {
		return initial();
	}
}

function applySnapshot(state: WeatherState, snap: WeatherSnapshot): WeatherState {
	return {
		...state,
		airTempF: snap.airTempF,
		conditions: snap.conditions,
		isRaining: snap.isRaining,
		rainNext24hIn: snap.rainNext24hIn,
		rainHours: snap.rainHours,
		lastFetchedAt: snap.fetchedAt
	};
}

class Weather {
	#state = $state<WeatherState>(initial());
	loading = $state(false);
	error = $state<string | null>(null);

	constructor() {
		if (typeof localStorage !== 'undefined') {
			this.#state = load();
			if (this.#state.lat != null && this.#state.lng != null) {
				this.refresh(false);
			}
		}
	}

	get lat() {
		return this.#state.lat;
	}
	get lng() {
		return this.#state.lng;
	}
	get locationLabel() {
		return this.#state.locationLabel;
	}
	get airTempF() {
		return this.#state.airTempF;
	}
	get conditions() {
		return this.#state.conditions;
	}
	get isRaining() {
		return this.#state.isRaining;
	}
	get rainNext24hIn() {
		return this.#state.rainNext24hIn;
	}
	get rainHours() {
		return this.#state.rainHours;
	}
	get manualTempF() {
		return this.#state.manualTempF;
	}
	set manualTempF(v: number | null) {
		this.#state.manualTempF = v;
		this.#save();
	}
	get useManualTemp() {
		return this.#state.useManualTemp;
	}
	set useManualTemp(v: boolean) {
		this.#state.useManualTemp = v;
		this.#save();
	}
	get lastFetchedAt() {
		return this.#state.lastFetchedAt;
	}
	get hasLocation() {
		return this.#state.lat != null && this.#state.lng != null;
	}

	/** Temp used by placement calculations — manual override or API value. */
	get effectiveTempF(): number | null {
		if (this.#state.useManualTemp && this.#state.manualTempF != null) {
			return this.#state.manualTempF;
		}
		return this.#state.airTempF;
	}

	async search(query: string): Promise<GeoResult[]> {
		return searchPlaces(query);
	}

	async setLocation(place: GeoResult) {
		this.#state = {
			...this.#state,
			lat: place.latitude,
			lng: place.longitude,
			locationLabel: formatLocation(place)
		};
		this.#save();
		await this.refresh(true);
	}

	async useGps() {
		this.loading = true;
		this.error = null;
		try {
			const { lat, lng } = await getCurrentPosition();
			const label = await reverseGeocode(lat, lng);
			this.#state = { ...this.#state, lat, lng, locationLabel: label };
			this.#save();
			await this.refresh(true);
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Could not get location';
		} finally {
			this.loading = false;
		}
	}

	async refresh(force = false) {
		const { lat, lng, lastFetchedAt } = this.#state;
		if (lat == null || lng == null) return;

		const staleMs = weatherConfig.refreshMinutes * 60 * 1000;
		if (!force && lastFetchedAt && Date.now() - lastFetchedAt < staleMs) return;

		this.loading = true;
		this.error = null;
		try {
			const snap = await fetchWeather(lat, lng);
			this.#state = applySnapshot(this.#state, snap);
			this.#save();
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Weather unavailable';
		} finally {
			this.loading = false;
		}
	}

	clear() {
		this.#state = initial();
		this.error = null;
		this.#save();
	}

	#save() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#state));
		} catch {
			// ignore
		}
	}
}

export const weather = new Weather();
