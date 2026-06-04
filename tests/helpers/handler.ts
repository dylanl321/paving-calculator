/**
 * tests/helpers/handler.ts
 *
 * Shared helper for invoking SvelteKit `+server.ts` route handlers in
 * integration tests. Handlers may either return a `Response` or `throw error(...)`
 * (a SvelteKit `HttpError`); this normalises both paths to a `Response`.
 */

import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import type { MockRequestEvent } from './request.js';

interface HttpErrorLike {
	status: number;
	body?: { message?: string };
}

/**
 * A route handler as exported from a `+server.ts`. Route-specific handlers from
 * SvelteKit's generated `$types` have a narrower `RequestEvent` (narrow
 * `RouteParams`/`RouteId`) than the generic `@sveltejs/kit` `RequestHandler`.
 * `RequestHandler<any, any>` relaxes both type params so any route's handler is
 * accepted.
 */
type AnyRouteHandler = RequestHandler<any, any>;

function isHttpError(e: unknown): e is HttpErrorLike {
	return (
		typeof e === 'object' &&
		e !== null &&
		'status' in e &&
		typeof (e as Record<string, unknown>).status === 'number'
	);
}

/**
 * Invoke a route handler with a mock event, normalising thrown `HttpError`s into
 * `Response` objects so tests can assert on `res.status` uniformly.
 */
export async function callHandler(
	handler: AnyRouteHandler,
	event: MockRequestEvent
): Promise<Response> {
	try {
		// MockRequestEvent intentionally omits a few platform-only fields; the
		// handler only touches the subset we provide.
		return await handler(event as unknown as RequestEvent<any, any>);
	} catch (err) {
		if (isHttpError(err)) {
			return new Response(JSON.stringify(err.body ?? {}), {
				status: err.status,
				headers: { 'content-type': 'application/json' }
			});
		}
		throw err;
	}
}
