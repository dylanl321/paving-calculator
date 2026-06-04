import type { Handle } from '@sveltejs/kit';
import { getAuthUser } from '$lib/server/auth';

// Paths that should never be logged (static assets, internal SvelteKit chunks).
const SKIP_LOG_PREFIXES = ['/_app/', '/icons/', '/fonts/', '/favicon'];

function shouldSkipLog(path: string): boolean {
	return SKIP_LOG_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function nanoid(): string {
	// 16-byte hex id — no external dep required.
	const arr = new Uint8Array(16);
	crypto.getRandomValues(arr);
	return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function insertLog(
	db: import('./cloudflare').D1Database,
	row: {
		id: string;
		timestamp: number;
		level: string;
		method: string;
		path: string;
		status: number;
		latency_ms: number;
		user_id: string | null;
		org_id: string | null;
		ip: string | null;
		user_agent: string | null;
		cf_ray: string | null;
		error_message: string | null;
		error_stack: string | null;
		metadata: string | null;
	}
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO app_logs
        (id, timestamp, level, method, path, status, latency_ms,
         user_id, org_id, ip, user_agent, cf_ray, error_message, error_stack, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			row.id,
			row.timestamp,
			row.level,
			row.method,
			row.path,
			row.status,
			row.latency_ms,
			row.user_id,
			row.org_id,
			row.ip,
			row.user_agent,
			row.cf_ray,
			row.error_message,
			row.error_stack,
			row.metadata
		)
		.run();
}

export const handle: Handle = async ({ event, resolve }) => {
	// Resolve user from session cookie / JWT.
	if (event.platform?.env?.DB) {
		event.locals.user = (await getAuthUser(event)) ?? undefined;
	}

	const path = new URL(event.request.url).pathname;

	// Skip logging for static assets.
	if (!event.platform?.env?.DB || shouldSkipLog(path)) {
		return resolve(event);
	}

	const db = event.platform.env.DB as import('./cloudflare').D1Database;
	const startMs = Date.now();

	let response: Response;
	let errorMessage: string | null = null;
	let errorStack: string | null = null;

	try {
		response = await resolve(event);
	} catch (err) {
		// Capture error details, then re-throw so SvelteKit handles 500 rendering.
		if (err instanceof Error) {
			errorMessage = err.message;
			errorStack = err.stack ?? null;
		} else {
			errorMessage = String(err);
		}
		// Create a synthetic 500 response for the log row.
		response = new Response('Internal Server Error', { status: 500 });

		// Fire-and-forget log before re-throwing.
		const logRow = {
			id: nanoid(),
			timestamp: Math.floor(Date.now() / 1000),
			level: 'error',
			method: event.request.method,
			path,
			status: 500,
			latency_ms: Date.now() - startMs,
			user_id: event.locals.user?.id ?? null,
			org_id: null,
			ip: event.request.headers.get('cf-connecting-ip') ?? null,
			user_agent: event.request.headers.get('user-agent') ?? null,
			cf_ray: event.request.headers.get('cf-ray') ?? null,
			error_message: errorMessage,
			error_stack: errorStack,
			metadata: null
		};

		// waitUntil keeps the Worker alive for the DB write without blocking the response.
		const logPromise = insertLog(db, logRow).catch((e) =>
			console.error('[app_logs] insert error:', e)
		);
		if (event.platform?.context?.waitUntil) {
			event.platform.context.waitUntil(logPromise);
		}
		// Re-throw so SvelteKit renders the error page normally.
		throw err;
	}

	const latency_ms = Date.now() - startMs;
	const status = response.status;
	const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

	const logRow = {
		id: nanoid(),
		timestamp: Math.floor(Date.now() / 1000),
		level,
		method: event.request.method,
		path,
		status,
		latency_ms,
		user_id: event.locals.user?.id ?? null,
		org_id: null,
		ip: event.request.headers.get('cf-connecting-ip') ?? null,
		user_agent: event.request.headers.get('user-agent') ?? null,
		cf_ray: event.request.headers.get('cf-ray') ?? null,
		error_message: null,
		error_stack: null,
		metadata: null
	};

	// Fire-and-forget: do not block the response.
	const logPromise = insertLog(db, logRow).catch((e) =>
		console.error('[app_logs] insert error:', e)
	);
	if (event.platform?.context?.waitUntil) {
		event.platform.context.waitUntil(logPromise);
	}

	return response;
};
