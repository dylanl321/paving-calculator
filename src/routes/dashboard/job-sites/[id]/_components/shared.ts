import type { JobSiteConfig } from '$lib/config';

/** The mutable, parent-owned configuration form shape (mirrors JobSiteConfig). */
export type ConfigForm = JobSiteConfig;

export const roadTypeLabels: Record<string, string> = {
	highway: 'Highway',
	state_route: 'State Route',
	county_road: 'County Road',
	city_street: 'City Street',
	subdivision: 'Subdivision',
	parking_lot: 'Parking Lot',
	other: 'Other'
};

export const scopeOfWorkLabels: Record<string, string> = {
	full_depth: 'Full Depth',
	mill_and_fill: 'Mill & Fill',
	overlay: 'Overlay',
	leveling: 'Leveling',
	patching: 'Patching',
	widening: 'Widening'
};

export const tackTypeLabels: Record<string, string> = {
	anionic: 'Anionic',
	cationic: 'Cationic',
	polymer_modified: 'Polymer Modified',
	trackless: 'Trackless'
};

export const equipmentTypeLabels: Record<string, string> = {
	paver: 'Paver',
	shuttle_buggy: 'Shuttle Buggy',
	roller_breakdown: 'Breakdown Roller',
	roller_intermediate: 'Intermediate Roller',
	roller_finish: 'Finish Roller',
	distributor: 'Distributor',
	milling_machine: 'Milling Machine',
	other: 'Other'
};

export function formatDate(timestamp: number): string {
	return new Date(timestamp * 1000).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

export function fmt(n: number, digits = 0): string {
	return n.toLocaleString('en-US', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	});
}

export function fmtDollars(v: number): string {
	return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
