// Map lenses: one map, a chip row that picks what you are looking at.
// Today = who is paving now, Progress = how far each job is, Setup = jobs the
// office still has to draw. Pure so the page and tests share the rules.

import type { UxRole } from '$lib/uxRole';

export type MapLens = 'today' | 'progress' | 'setup';

export const MAP_LENSES: { id: MapLens; label: string }[] = [
	{ id: 'today', label: 'Today' },
	{ id: 'progress', label: 'Progress' },
	{ id: 'setup', label: 'Setup' }
];

export interface LensSite {
	id: string;
	status: string;
	has_geometry: boolean;
	crew_name: string | null;
}

export interface LensLive {
	today_log_open: boolean;
	today_tons: number;
	today_loads: number;
}

/** Where each role starts. The chip row lets anyone switch. */
export function defaultLensForRole(role: UxRole): MapLens {
	switch (role) {
		case 'owner':
			return 'progress';
		case 'admin_office':
			return 'setup';
		default:
			return 'today';
	}
}

export function parseLens(value: string | null | undefined): MapLens | null {
	return value === 'today' || value === 'progress' || value === 'setup' ? value : null;
}

const isActive = (s: LensSite) => s.status === 'active' || s.status === 'logging';

/** The jobs a lens shows on the map and lists first. */
export function sitesForLens<T extends LensSite>(sites: T[], lens: MapLens, live: Map<string, LensLive>): T[] {
	switch (lens) {
		case 'today': {
			const logging = sites.filter((s) => live.get(s.id)?.today_log_open);
			// Without live status (or nobody logging yet) show active jobs with a crew.
			return logging.length > 0 ? logging : sites.filter((s) => isActive(s) && s.crew_name != null);
		}
		case 'progress':
			return sites.filter((s) => s.status !== 'archived');
		case 'setup':
			return sites.filter((s) => !s.has_geometry && s.status !== 'archived' && s.status !== 'completed');
	}
}

export const LENS_COLORS = {
	focus: '#f2c037',
	logging: '#e0a21e',
	done: '#2f855a',
	active: '#3b6fb6',
	idle: '#94a3b8',
	setup: '#b7791f'
} as const;

/** Line color for a job under a lens. The focused job keeps the accent. */
export function lensColor(site: LensSite, lens: MapLens, focused: boolean, live: Map<string, LensLive>): string {
	if (focused) return LENS_COLORS.focus;
	if (lens === 'today') return live.get(site.id)?.today_log_open ? LENS_COLORS.logging : LENS_COLORS.idle;
	if (lens === 'setup') return site.has_geometry ? LENS_COLORS.idle : LENS_COLORS.setup;
	if (site.status === 'completed') return LENS_COLORS.done;
	if (isActive(site)) return LENS_COLORS.active;
	return LENS_COLORS.idle;
}

/** One-line answer for the lens, shown over the map. */
export function lensSummary<T extends LensSite>(sites: T[], lens: MapLens, live: Map<string, LensLive>): string {
	const shown = sitesForLens(sites, lens, live);
	if (lens === 'today') {
		const logging = sites.filter((s) => live.get(s.id)?.today_log_open);
		if (logging.length === 0) return shown.length ? `No job is logging yet. ${shown.length} active with a crew.` : 'No job is paving today';
		const tons = logging.reduce((sum, s) => sum + (live.get(s.id)?.today_tons ?? 0), 0);
		return `${logging.length} job${logging.length === 1 ? '' : 's'} paving · ${Math.round(tons).toLocaleString('en-US')} t so far`;
	}
	if (lens === 'setup') {
		return shown.length === 0
			? 'Every open job has a road line'
			: `${shown.length} job${shown.length === 1 ? ' needs' : 's need'} a road line`;
	}
	const active = sites.filter(isActive).length;
	const done = sites.filter((s) => s.status === 'completed').length;
	return `${active} active · ${done} done · ${shown.length} on the map`;
}
