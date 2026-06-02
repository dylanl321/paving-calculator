// Open-Meteo client — free, no API key. Used when online; last fetch is cached in the weather store.
import { weatherConfig } from '$lib/config';

const MM_TO_IN = 1 / 25.4;

export interface GeoResult {
	name: string;
	admin1?: string;
	country?: string;
	latitude: number;
	longitude: number;
}

export interface RainHour {
	time: string;
	precipIn: number;
	probability: number;
}

export interface DayForecast {
	date: string;
	highF: number;
	lowF: number;
	conditions: string;
	precipIn: number;
	precipProbabilityMax: number;
}

export interface WeatherSnapshot {
	airTempF: number;
	conditions: string;
	isRaining: boolean;
	rainNext24hIn: number;
	rainHours: RainHour[];
	dailyForecast: DayForecast[];
	fetchedAt: number;
}

const WMO_LABELS: Record<number, string> = {
	0: 'Clear',
	1: 'Mainly clear',
	2: 'Partly cloudy',
	3: 'Overcast',
	45: 'Fog',
	48: 'Fog',
	51: 'Light drizzle',
	53: 'Drizzle',
	55: 'Heavy drizzle',
	61: 'Light rain',
	63: 'Rain',
	65: 'Heavy rain',
	71: 'Light snow',
	73: 'Snow',
	75: 'Heavy snow',
	80: 'Rain showers',
	81: 'Rain showers',
	82: 'Heavy showers',
	95: 'Thunderstorm',
	96: 'Thunderstorm',
	99: 'Thunderstorm'
};

const RAIN_CODES = new Set([
	51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99
]);

function labelFromCode(code: number): string {
	return WMO_LABELS[code] ?? 'Unknown';
}

function isRainCode(code: number): boolean {
	return RAIN_CODES.has(code);
}

export function formatLocation(r: GeoResult): string {
	const parts = [r.name];
	if (r.admin1) parts.push(r.admin1);
	return parts.join(', ');
}

/** Search cities / places by name (US-friendly). */
export async function searchPlaces(query: string): Promise<GeoResult[]> {
	const q = query.trim();
	if (q.length < 2) return [];

	const url = new URL(weatherConfig.geocodeUrl);
	url.searchParams.set('name', q);
	url.searchParams.set('count', '8');
	url.searchParams.set('language', 'en');
	url.searchParams.set('format', 'json');

	const res = await fetch(url);
	if (!res.ok) throw new Error('Location search failed');
	const data = (await res.json()) as { results?: GeoResult[] };
	return data.results ?? [];
}

/** Fetch current conditions + next-24h rain forecast + 10-day daily forecast for a lat/lng. */
export async function fetchWeather(lat: number, lng: number): Promise<WeatherSnapshot> {
	const url = new URL(weatherConfig.forecastUrl);
	url.searchParams.set('latitude', String(lat));
	url.searchParams.set('longitude', String(lng));
	url.searchParams.set(
		'current',
		'temperature_2m,weather_code,precipitation,is_day'
	);
	url.searchParams.set('hourly', 'precipitation,precipitation_probability,weather_code');
	url.searchParams.set(
		'daily',
		'temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,precipitation_probability_max'
	);
	url.searchParams.set('forecast_days', '10');
	url.searchParams.set('temperature_unit', 'fahrenheit');
	url.searchParams.set('precipitation_unit', 'mm');
	url.searchParams.set('timezone', 'auto');

	const res = await fetch(url);
	if (!res.ok) throw new Error('Weather fetch failed');

	const data = (await res.json()) as {
		current: {
			temperature_2m: number;
			weather_code: number;
			precipitation: number;
		};
		hourly: {
			time: string[];
			precipitation: number[];
			precipitation_probability: number[];
			weather_code: number[];
		};
		daily: {
			time: string[];
			temperature_2m_max: number[];
			temperature_2m_min: number[];
			weather_code: number[];
			precipitation_sum: number[];
			precipitation_probability_max: number[];
		};
	};

	const now = Date.now();
	const end = now + 24 * 60 * 60 * 1000;

	const rainHours: RainHour[] = [];
	let rainNext24hMm = 0;

	for (let i = 0; i < data.hourly.time.length; i++) {
		const t = new Date(data.hourly.time[i]).getTime();
		if (t < now || t > end) continue;

		const precipMm = data.hourly.precipitation[i] ?? 0;
		const prob = data.hourly.precipitation_probability[i] ?? 0;
		const code = data.hourly.weather_code[i] ?? 0;

		rainNext24hMm += precipMm;

		if (precipMm > 0 || prob >= 40 || isRainCode(code)) {
			rainHours.push({
				time: data.hourly.time[i],
				precipIn: precipMm * MM_TO_IN,
				probability: prob
			});
		}
	}

	const code = data.current.weather_code;
	const currentPrecip = data.current.precipitation ?? 0;

	const dailyForecast: DayForecast[] = [];
	for (let i = 0; i < data.daily.time.length; i++) {
		dailyForecast.push({
			date: data.daily.time[i],
			highF: Math.round(data.daily.temperature_2m_max[i]),
			lowF: Math.round(data.daily.temperature_2m_min[i]),
			conditions: labelFromCode(data.daily.weather_code[i]),
			precipIn: (data.daily.precipitation_sum[i] ?? 0) * MM_TO_IN,
			precipProbabilityMax: data.daily.precipitation_probability_max[i] ?? 0
		});
	}

	return {
		airTempF: Math.round(data.current.temperature_2m),
		conditions: labelFromCode(code),
		isRaining: currentPrecip > 0 || isRainCode(code),
		rainNext24hIn: rainNext24hMm * MM_TO_IN,
		rainHours,
		dailyForecast,
		fetchedAt: now
	};
}

/** Try browser geolocation; returns lat/lng or throws. */
export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
	return new Promise((resolve, reject) => {
		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			reject(new Error('Geolocation not available'));
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
			(err) => reject(new Error(err.message || 'Location denied')),
			{ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
		);
	});
}

/** Reverse-geocode coordinates to a place label (falls back to coordinate string). */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
	const url = new URL(weatherConfig.geocodeUrl);
	url.searchParams.set('name', `${lat.toFixed(2)},${lng.toFixed(2)}`);
	url.searchParams.set('count', '1');
	const res = await fetch(url);
	if (res.ok) {
		const data = (await res.json()) as { results?: GeoResult[] };
		if (data.results?.[0]) return formatLocation(data.results[0]);
	}
	return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`;
}

export function formatRainTime(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleString(undefined, {
		weekday: 'short',
		hour: 'numeric',
		minute: '2-digit'
	});
}
