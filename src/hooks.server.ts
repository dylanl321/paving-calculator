import type { Handle } from '@sveltejs/kit';
import { getAuthUser } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.platform?.env?.DB) {
		event.locals.user = (await getAuthUser(event)) ?? undefined;
	}
	return resolve(event);
};
