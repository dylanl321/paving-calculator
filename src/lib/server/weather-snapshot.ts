/**
 * Server-side weather snapshot helper.
 * Fetches current conditions from Open-Meteo for a lat/lng and returns
 * the subset stored on daily_logs rows. Throws on any network/parse error —
 * callers should catch and skip gracefully so offline scenarios never block
 * log creation.
 */

interface SnapshotFields {
	weather_temp_f: number;
	weather_conditions: 'clear' | 'cloudy' | 'rain' | 'wind' | 'fog';
	wind_speed_mph: number;
	is_raining: number; // 0 | 1 for SQLite
	weather_fetched_at: number;
}

const WMO_RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);
const WMO_WIND_CODES = new Set([51, 53, 55, 61, 63, 65, 71, 73, 75]); // high precipitation often = wind but we rely on wind_speed
const WMO_FOG_CODES = new Set([45, 48]);
const WMO_SNOW_CODES = new Set([71, 73, 75, 77]);

function mapConditions(
	wmoCode: number,
	precipMm: number,
	windKph: number
): 'clear' | 'cloudy' | 'rain' | 'wind' | 'fog' {
	if (WMO_FOG_CODES.has(wmoCode)) return 'fog';
	if (WMO_RAIN_CODES.has(wmoCode) || WMO_SNOW_CODES.has(wmoCode) || precipMm > 0) return 'rain';
	if (windKph >= 32) return 'wind'; // ~20 mph — paving concern threshold
	if (wmoCode >= 2) return 'cloudy'; // partly cloudy or overcast
	return 'clear';
}

export async function fetchWeatherSnapshot(lat: number, lng: number): Promise<SnapshotFields> {
	const url = new URL('https://api.open-meteo.com/v1/forecast');
	url.searchParams.set('latitude', String(lat));
	url.searchParams.set('longitude', String(lng));
	url.searchParams.set('current', 'temperature_2m,weather_code,precipitation,wind_speed_10m');
	url.searchParams.set('temperature_unit', 'fahrenheit');
	url.searchParams.set('wind_speed_unit', 'kmh');
	url.searchParams.set('precipitation_unit', 'mm');
	url.searchParams.set('timezone', 'auto');
	url.searchParams.set('forecast_days', '1');

	const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
	if (!res.ok) throw new Error(`Weather API error: ${res.status}`);

	const data = (await res.json()) as {
		current: {
			temperature_2m: number;
			weather_code: number;
			precipitation: number;
			wind_speed_10m: number;
		};
	};

	const { temperature_2m, weather_code, precipitation, wind_speed_10m } = data.current;
	const windKph = wind_speed_10m ?? 0;
	const precipMm = precipitation ?? 0;
	const isRaining = WMO_RAIN_CODES.has(weather_code) || precipMm > 0;
	const windMph = Math.round(windKph * 0.621371);

	return {
		weather_temp_f: Math.round(temperature_2m),
		weather_conditions: mapConditions(weather_code, precipMm, windKph),
		wind_speed_mph: windMph,
		is_raining: isRaining ? 1 : 0,
		weather_fetched_at: Math.floor(Date.now() / 1000)
	};
}
