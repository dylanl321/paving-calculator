/**
 * Typed fetch wrapper with automatic toast notifications and structured error
 * handling. Replaces one-off fetch+.json() calls scattered across the app.
 */

import { toastStore } from '$lib/stores/toast.svelte';
import { goto } from '$app/navigation';

// ── Error types ──────────────────────────────────────────────────────────────

export class ApiRequestError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly code?: string,
		public readonly body?: unknown
	) {
		super(message);
		this.name = 'ApiRequestError';
	}
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface ApiRequestOptions extends RequestInit {
	/** Skip showing a toast on error. Default: false. */
	silent?: boolean;
	/** Custom error message to show in the toast (overrides server message). */
	errorMessage?: string;
}

// ── Core helper ──────────────────────────────────────────────────────────────

/**
 * Fetch wrapper that:
 * - Parses JSON response (success or error body)
 * - Throws ApiRequestError on non-2xx responses
 * - Auto-shows an error toast unless {silent: true}
 * - Redirects to /login on 401
 * - Shows "permission denied" toast on 403
 */
export async function apiRequest<T = unknown>(
	url: string,
	options: ApiRequestOptions = {}
): Promise<T> {
	const { silent = false, errorMessage: customMessage, ...fetchOptions } = options;

	let res: Response;
	try {
		res = await fetch(url, fetchOptions);
	} catch (networkErr) {
		const msg = 'Network error — check your connection';
		if (!silent) toastStore.error(msg);
		throw new ApiRequestError(msg, 0, 'NETWORK_ERROR', networkErr);
	}

	// Parse body regardless of status (server may return error JSON)
	let body: unknown = null;
	const ct = res.headers.get('content-type') ?? '';
	if (ct.includes('application/json')) {
		try {
			body = await res.json();
		} catch {
			body = null;
		}
	} else {
		try {
			body = await res.text();
		} catch {
			body = null;
		}
	}

	if (res.ok) {
		return body as T;
	}

	// Extract error message from body
	let serverMsg = 'Something went wrong';
	if (
		typeof body === 'object' &&
		body !== null &&
		typeof (body as Record<string, unknown>).error === 'string'
	) {
		serverMsg = (body as { error: string }).error;
	}

	const code =
		typeof body === 'object' && body !== null
			? ((body as Record<string, unknown>).code as string | undefined)
			: undefined;

	const toastMsg = customMessage ?? serverMsg;

	// Status-specific handling
	if (res.status === 401) {
		if (!silent) toastStore.info('Session expired — please sign in again');
		goto('/login');
		throw new ApiRequestError(serverMsg, 401, code ?? 'UNAUTHORIZED', body);
	}

	if (res.status === 403) {
		if (!silent) toastStore.error('You do not have permission to do that');
		throw new ApiRequestError(serverMsg, 403, code ?? 'FORBIDDEN', body);
	}

	if (!silent) toastStore.error(toastMsg);
	throw new ApiRequestError(serverMsg, res.status, code, body);
}

// ── Convenience methods ───────────────────────────────────────────────────────

export const api = {
	get: <T = unknown>(url: string, options?: ApiRequestOptions) =>
		apiRequest<T>(url, { method: 'GET', ...options }),

	post: <T = unknown>(url: string, data?: unknown, options?: ApiRequestOptions) =>
		apiRequest<T>(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
			body: data !== undefined ? JSON.stringify(data) : undefined,
			...options
		}),

	put: <T = unknown>(url: string, data?: unknown, options?: ApiRequestOptions) =>
		apiRequest<T>(url, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
			body: data !== undefined ? JSON.stringify(data) : undefined,
			...options
		}),

	patch: <T = unknown>(url: string, data?: unknown, options?: ApiRequestOptions) =>
		apiRequest<T>(url, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
			body: data !== undefined ? JSON.stringify(data) : undefined,
			...options
		}),

	delete: <T = unknown>(url: string, options?: ApiRequestOptions) =>
		apiRequest<T>(url, { method: 'DELETE', ...options })
};
