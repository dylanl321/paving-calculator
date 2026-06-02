import { redirect } from '@sveltejs/kit';

export const load = () => {
	// The calculator workspace at / now hosts every tool (asphalt, soil,
	// concrete, grading) via the tool list, so the separate all-calculators
	// page is folded into the workspace.
	throw redirect(308, '/');
};
