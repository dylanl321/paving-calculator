// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
/// <reference types="@vite-pwa/sveltekit" />
/// <reference types="vite-plugin-pwa/client" />

import type { D1Database, R2Bucket } from './cloudflare';

declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
				ASSETS_BUCKET: R2Bucket;
				SUPER_ADMIN_EMAILS?: string;
				RESEND_API_KEY?: string;
			};
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
