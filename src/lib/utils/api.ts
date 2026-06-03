// Shared typed fetch helpers. Replaces the copy-pasted `const data = await
// res.json()` pattern (untyped `unknown`) that recurred across many components.

export interface ApiError {
	error: string;
}

/** True once we've narrowed an unknown JSON body to an object with a string `error`. */
export function hasError(body: unknown): body is ApiError {
	return typeof body === 'object' && body !== null && typeof (body as Record<string, unknown>).error === 'string';
}

/** Parse a Response body as T. On failure returns the fallback (default {}). */
export async function parseJson<T = unknown>(res: Response, fallback?: T): Promise<T> {
	try {
		return (await res.json()) as T;
	} catch {
		return (fallback ?? ({} as T)) as T;
	}
}

/** Extract an error message from a failed Response, falling back to a default. */
export async function errorMessage(res: Response, fallback = 'Something went wrong'): Promise<string> {
	const body = await parseJson<unknown>(res);
	return hasError(body) ? body.error : fallback;
}

/**
 * fetch + typed JSON in one call. Returns { ok, status, data }. `data` is typed
 * as T (caller asserts the success shape); use `errorMessage` for the failure path.
 */
export async function fetchJson<T = unknown>(
	input: RequestInfo | URL,
	init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
	const res = await fetch(input, init);
	const data = await parseJson<T>(res);
	return { ok: res.ok, status: res.status, data };
}
