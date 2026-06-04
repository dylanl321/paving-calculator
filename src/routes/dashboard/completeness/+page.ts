import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { SiteCompleteness } from '$lib/server/completeness';

export interface SiteResult {
	id: string;
	name: string;
	status: string;
	completeness: SiteCompleteness;
}

export interface CompletenessData {
	org_id: string;
	computed_at: string;
	summary: {
		total_sites: number;
		complete: number;
		needs_attention: number;
		incomplete: number;
		avg_score: number;
	};
	sites: SiteResult[];
}

export const load: PageLoad = async ({ fetch }) => {
	try {
		const authRes = await fetch('/api/auth/me', { credentials: 'include' });
		if (!authRes.ok) {
			throw redirect(302, '/login');
		}

		const authData = (await authRes.json()) as { user: unknown; org: unknown };

		const completenessRes = await fetch('/api/org/completeness', { credentials: 'include' });
		if (!completenessRes.ok) {
			throw new Error('Failed to fetch completeness data');
		}

		const completeness = (await completenessRes.json()) as CompletenessData;

		return {
			user: authData.user,
			org: authData.org,
			completeness
		};
	} catch (err) {
		if (err instanceof Response) throw err;
		throw redirect(302, '/login');
	}
};
