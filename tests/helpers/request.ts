/**
 * tests/helpers/request.ts
 *
 * Mock RequestEvent factory for SvelteKit integration tests.
 * Returns a RequestEvent-compatible object with a D1-backed platform.env.
 */

import type { RequestEvent } from '@sveltejs/kit';
import type { D1DatabaseCompat } from './db.js';

export interface MockRequestEventOpts {
	db: D1DatabaseCompat;
	method?: string;
	pathname?: string;
	searchParams?: Record<string, string>;
	body?: unknown;
	params?: Record<string, string>;
	headers?: Record<string, string>;
	cookies?: Record<string, string>;
}

export interface MockCookieJar {
	get(name: string): string | undefined;
	set(name: string, value: string, opts?: Record<string, unknown>): void;
	delete(name: string, opts?: Record<string, unknown>): void;
	getAll(): Array<{ name: string; value: string }>;
	serialize(name: string, value: string, opts?: Record<string, unknown>): string;
}

export interface MockRequestEvent extends Omit<RequestEvent, 'platform'> {
	platform: {
		env: {
			DB: D1DatabaseCompat;
			ASSETS_BUCKET: unknown;
			SUPER_ADMIN_EMAILS: string | undefined;
		};
		context: unknown;
		caches: unknown;
		cf: unknown;
	};
}

/**
 * Creates a mock RequestEvent for SvelteKit integration tests.
 */
export function mockRequestEvent(opts: MockRequestEventOpts): MockRequestEvent {
	const {
		db,
		method = 'GET',
		pathname = '/',
		searchParams = {},
		body,
		params = {},
		headers = {},
		cookies: initialCookies = {}
	} = opts;

	// Build URL with search params
	const url = new URL(pathname, 'http://localhost:5173');
	for (const [key, value] of Object.entries(searchParams)) {
		url.searchParams.set(key, value);
	}

	// Build headers
	const reqHeaders = new Headers(headers);
	if (body !== undefined) {
		reqHeaders.set('content-type', 'application/json');
	}

	// Build cookie header from initial cookies
	if (Object.keys(initialCookies).length > 0) {
		const cookieHeader = Object.entries(initialCookies)
			.map(([name, value]) => `${name}=${value}`)
			.join('; ');
		reqHeaders.set('cookie', cookieHeader);
	}

	// Build Request object
	const request = new Request(url, {
		method,
		headers: reqHeaders,
		body: body !== undefined ? JSON.stringify(body) : undefined
	});

	// Cookie jar with mutation tracking
	const cookieStore = new Map<string, string>(Object.entries(initialCookies));
	const deletedCookies = new Set<string>();

	const cookieJar: MockCookieJar = {
		get(name: string): string | undefined {
			if (deletedCookies.has(name)) return undefined;
			return cookieStore.get(name);
		},

		set(name: string, value: string, _opts?: Record<string, unknown>): void {
			cookieStore.set(name, value);
			deletedCookies.delete(name);
		},

		delete(name: string, _opts?: Record<string, unknown>): void {
			deletedCookies.add(name);
			cookieStore.delete(name);
		},

		getAll(): Array<{ name: string; value: string }> {
			const result: Array<{ name: string; value: string }> = [];
			for (const [name, value] of cookieStore.entries()) {
				if (!deletedCookies.has(name)) {
					result.push({ name, value });
				}
			}
			return result;
		},

		serialize(name: string, value: string, _opts?: Record<string, unknown>): string {
			return `${name}=${value}`;
		}
	};

	// Mock R2 bucket (no-op)
	const mockR2Bucket = {
		get: async () => null,
		put: async () => ({}),
		delete: async () => undefined,
		list: async () => ({ objects: [], truncated: false, cursor: undefined })
	};

	const event: MockRequestEvent = {
		request,
		url,
		params,
		cookies: cookieJar as unknown as RequestEvent['cookies'],
		platform: {
			env: {
				DB: db,
				ASSETS_BUCKET: mockR2Bucket,
				SUPER_ADMIN_EMAILS: undefined
			},
			context: {},
			caches: undefined,
			cf: undefined
		},
		locals: {},
		route: { id: pathname as any },
		setHeaders: () => {},
		isDataRequest: false,
		isSubRequest: false,
		isRemoteRequest: false,
		tracing: {
			enabled: false,
			root: {} as any,
			current: {} as any
		},
		getClientAddress: () => '127.0.0.1',
		fetch: globalThis.fetch
	};

	return event;
}
