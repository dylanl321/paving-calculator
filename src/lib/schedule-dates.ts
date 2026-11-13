/**
 * Add whole calendar days to a YYYY-MM-DD date.
 * Uses the local calendar so a date-only string is not shifted by UTC parsing
 * (`new Date('2026-06-01')` is midnight UTC, which is the previous evening
 * in US time zones).
 */
export function addDaysToIsoDate(isoDate: string, days: number): string | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
	if (!match || !Number.isFinite(days)) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}
	date.setDate(date.getDate() + Math.trunc(days));
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}
