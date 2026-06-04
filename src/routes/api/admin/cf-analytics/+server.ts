import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';

interface AnalyticsResponse {
	requests_total: number;
	requests_cached: number;
	error_count_4xx: number;
	error_count_5xx: number;
	bandwidth_bytes: number;
	bandwidth_cached_bytes: number;
	period: string;
	cached_at: string;
}

interface CacheEntry {
	data: AnalyticsResponse;
	expires: number;
}

const CACHE_TTL_MS = 300_000; // 5 minutes
const cache = new Map<string, CacheEntry>();
let zoneIdCache: string | null = null;

const CF_ACCOUNT_ID = '5607dd23b8b5465da7f08be9b0acbcd6';

interface CFGraphQLResponse {
	data?: {
		viewer?: {
			zones?: Array<{
				httpRequests1hGroups?: Array<{
					sum: {
						requests: number;
						cachedRequests: number;
						bytes: number;
						cachedBytes: number;
						responseStatusMap: Array<{
							edgeResponseStatus: number;
							requests: number;
						}>;
						clientRequestHTTPMethodMap?: Array<{
							clientRequestHTTPMethodName: string;
							requests: number;
						}>;
					};
				}>;
				httpRequests1dGroups?: Array<{
					sum: {
						requests: number;
						cachedRequests: number;
						bytes: number;
						cachedBytes: number;
						responseStatusMap: Array<{
							edgeResponseStatus: number;
							requests: number;
						}>;
					};
				}>;
			}>;
		};
	};
	errors?: Array<{
		message: string;
	}>;
}

interface CFZonesResponse {
	result?: Array<{
		id: string;
		name: string;
	}>;
	errors?: Array<{
		message: string;
	}>;
}

async function fetchZoneId(email: string, apiKey: string): Promise<string> {
	if (zoneIdCache) {
		return zoneIdCache;
	}

	const response = await fetch('https://api.cloudflare.com/client/v4/zones?name=paverate.com', {
		headers: {
			'X-Auth-Email': email,
			'X-Auth-Key': apiKey
		}
	});

	if (!response.ok) {
		throw new Error('Failed to fetch zone ID');
	}

	const data = (await response.json()) as CFZonesResponse;
	if (data.errors && data.errors.length > 0) {
		throw new Error('Zone lookup errors: ' + data.errors.map((e) => e.message).join(', '));
	}

	if (!data.result || data.result.length === 0) {
		throw new Error('Zone not found');
	}

	zoneIdCache = data.result[0].id;
	return zoneIdCache;
}

function buildGraphQLQuery(
	zoneId: string,
	period: string
): { query: string; useHourly: boolean } {
	const now = new Date();
	let datetimeGeq: string;
	let datetimeLte: string;
	let useHourly = true;
	let limit = 168;

	switch (period) {
		case '1h':
			datetimeGeq = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
			datetimeLte = now.toISOString();
			limit = 1;
			break;
		case '6h':
			datetimeGeq = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
			datetimeLte = now.toISOString();
			limit = 6;
			break;
		case '24h':
			useHourly = false;
			datetimeGeq = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
			datetimeLte = now.toISOString().split('T')[0];
			limit = 1;
			break;
		case '7d':
			useHourly = false;
			datetimeGeq = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
			datetimeLte = now.toISOString().split('T')[0];
			limit = 7;
			break;
		case '30d':
			useHourly = false;
			datetimeGeq = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
			datetimeLte = now.toISOString().split('T')[0];
			limit = 30;
			break;
		default:
			useHourly = false;
			datetimeGeq = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
			datetimeLte = now.toISOString().split('T')[0];
			limit = 1;
	}

	if (useHourly) {
		return {
			query: `query {
				viewer {
					zones(filter: { zoneTag: "${zoneId}" }) {
						httpRequests1hGroups(limit: ${limit}, filter: { datetime_geq: "${datetimeGeq}", datetime_leq: "${datetimeLte}" }) {
							sum {
								requests
								cachedRequests
								bytes
								cachedBytes
								responseStatusMap {
									edgeResponseStatus
									requests
								}
								clientRequestHTTPMethodMap {
									clientRequestHTTPMethodName
									requests
								}
							}
						}
					}
				}
			}`,
			useHourly: true
		};
	} else {
		return {
			query: `query {
				viewer {
					zones(filter: { zoneTag: "${zoneId}" }) {
						httpRequests1dGroups(limit: ${limit}, filter: { date_geq: "${datetimeGeq}", date_leq: "${datetimeLte}" }) {
							sum {
								requests
								cachedRequests
								bytes
								cachedBytes
								responseStatusMap {
									edgeResponseStatus
									requests
								}
							}
						}
					}
				}
			}`,
			useHourly: false
		};
	}
}

async function fetchAnalytics(
	email: string,
	apiKey: string,
	zoneId: string,
	period: string
): Promise<AnalyticsResponse> {
	const { query, useHourly } = buildGraphQLQuery(zoneId, period);

	const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
		method: 'POST',
		headers: {
			'X-Auth-Email': email,
			'X-Auth-Key': apiKey,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ query })
	});

	if (!response.ok) {
		throw new Error('Cloudflare GraphQL request failed');
	}

	const data = (await response.json()) as CFGraphQLResponse;

	if (data.errors && data.errors.length > 0) {
		console.error('Cloudflare GraphQL errors:', data.errors);
	}

	let requests_total = 0;
	let requests_cached = 0;
	let error_count_4xx = 0;
	let error_count_5xx = 0;
	let bandwidth_bytes = 0;
	let bandwidth_cached_bytes = 0;

	const zones = data.data?.viewer?.zones;
	if (zones && zones.length > 0) {
		const zone = zones[0];
		const groups = useHourly ? zone.httpRequests1hGroups : zone.httpRequests1dGroups;

		if (groups) {
			for (const group of groups) {
				requests_total += group.sum.requests || 0;
				requests_cached += group.sum.cachedRequests || 0;
				bandwidth_bytes += group.sum.bytes || 0;
				bandwidth_cached_bytes += group.sum.cachedBytes || 0;

				if (group.sum.responseStatusMap) {
					for (const statusEntry of group.sum.responseStatusMap) {
						const status = statusEntry.edgeResponseStatus;
						if (status >= 400 && status < 500) {
							error_count_4xx += statusEntry.requests || 0;
						} else if (status >= 500) {
							error_count_5xx += statusEntry.requests || 0;
						}
					}
				}
			}
		}
	}

	return {
		requests_total,
		requests_cached,
		error_count_4xx,
		error_count_5xx,
		bandwidth_bytes,
		bandwidth_cached_bytes,
		period,
		cached_at: new Date().toISOString()
	};
}

export async function GET(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);

		const period = (event.url.searchParams.get('period') || '24h') as string;
		const validPeriods = ['1h', '6h', '24h', '7d', '30d'];
		const normalizedPeriod = validPeriods.includes(period) ? period : '24h';

		// Check cache first
		const cached = cache.get(normalizedPeriod);
		if (cached && cached.expires > Date.now()) {
			return json(cached.data);
		}

		const apiKey = event.platform?.env?.CLOUDFLARE_GLOBAL_API_KEY;
		const email = event.platform?.env?.CLOUDFLARE_EMAIL;

		if (!apiKey || !email) {
			return json(
				{ error: 'Cloudflare credentials not configured' },
				{ status: 503 }
			);
		}

		let zoneId: string;
		try {
			zoneId = await fetchZoneId(email, apiKey);
		} catch (error) {
			console.error('Zone ID fetch failed:', error);
			return json(
				{ error: 'Failed to fetch zone ID' },
				{ status: 502 }
			);
		}

		const analyticsData = await fetchAnalytics(email, apiKey, zoneId, normalizedPeriod);

		// Store in cache
		cache.set(normalizedPeriod, {
			data: analyticsData,
			expires: Date.now() + CACHE_TTL_MS
		});

		return json(analyticsData);
	} catch (error) {
		if (error instanceof Response) {
			throw error;
		}
		console.error('Unexpected error in cf-analytics endpoint:', error);
		return json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
