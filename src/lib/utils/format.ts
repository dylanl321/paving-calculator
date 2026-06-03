// Shared display/formatting helpers. Consolidates ~7 per-file copies of these
// functions that drifted across separate feature branches.

/** Feet with mile rollover: "1,200 ft" or "1.42 mi". Null -> em dash. */
export function formatFeet(ft: number | null | undefined): string {
	if (ft == null) return '—';
	if (ft >= 5280) return `${(ft / 5280).toFixed(2)} mi`;
	return `${Math.round(ft).toLocaleString()} ft`;
}

/** Tons to one decimal: "12.5 t". Null -> em dash. */
export function formatTons(tons: number | null | undefined): string {
	if (tons == null) return '—';
	return `${tons.toFixed(1)} t`;
}

/**
 * A date for display. Accepts either a unix-seconds timestamp (number) or a
 * "YYYY-MM-DD" string. Renders like "Jun 2, 2026".
 */
export function formatDate(value: number | string | null | undefined): string {
	if (value == null) return '—';
	const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value + 'T00:00:00');
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A unix-seconds timestamp as date + time, e.g. "Jun 2, 2026, 3:14 PM". */
export function formatTimestamp(tsSeconds: number | null | undefined): string {
	if (tsSeconds == null) return '—';
	const d = new Date(tsSeconds * 1000);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

/** A unix-seconds timestamp as time only, e.g. "3:14 PM". */
export function formatTime(tsSeconds: number | null | undefined): string {
	if (tsSeconds == null) return '—';
	const d = new Date(tsSeconds * 1000);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** "Just now" / "5m ago" / "3h ago" / "2d ago" from a unix-seconds timestamp. */
export function formatRelativeTime(tsSeconds: number | null | undefined): string {
	if (tsSeconds == null) return '—';
	const deltaSec = Math.max(0, Math.floor(Date.now() / 1000) - tsSeconds);
	if (deltaSec < 60) return 'Just now';
	if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
	if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
	return `${Math.floor(deltaSec / 86400)}d ago`;
}

/** Up to two uppercase initials from a name, e.g. "Dylan Reed" -> "DR". */
export function getInitials(name: string | null | undefined): string {
	if (!name) return '?';
	return name
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase() ?? '')
		.join('');
}

/**
 * Decimal hours between two "HH:MM" clock strings (handles past-midnight by
 * rolling the end time forward a day). Returns 0 if either is missing/invalid.
 */
export function hoursBetween(startHHMM: string | null | undefined, endHHMM: string | null | undefined): number {
	if (!startHHMM || !endHHMM) return 0;
	const [sh, sm] = startHHMM.split(':').map(Number);
	const [eh, em] = endHHMM.split(':').map(Number);
	if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
	let minutes = eh * 60 + em - (sh * 60 + sm);
	if (minutes < 0) minutes += 24 * 60;
	return minutes / 60;
}

/** Hex-encode a byte array (SHA/HMAC digests). */
export function toHex(bytes: ArrayBuffer | Uint8Array): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	return Array.from(view)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
