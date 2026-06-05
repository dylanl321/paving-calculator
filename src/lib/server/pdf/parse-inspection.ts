/**
 * Parser for GDOT Daily Inspection Reports.
 *
 * Handles two common GDOT form layouts:
 *  - "DAILY REPORT OF CONSTRUCTION" (GDOT Form 101/102 style)
 *  - "INSPECTOR'S DAILY REPORT" (DOT site-inspection form)
 *
 * Extraction is best-effort with confidence levels. Any field not found is
 * left null — we never invent data that isn't present in the source text.
 */

import { field, type ParsedField } from './confidence.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedInspectionReport {
	/** Date of the inspection (ISO date string when parseable, raw string otherwise). */
	date: ParsedField<string>;
	/** Inspector name. */
	inspector_name: ParsedField<string>;
	/** Prime contractor name. */
	contractor: ParsedField<string>;
	/** Weather conditions (e.g. "Sunny", "Partly Cloudy"). */
	weather: ParsedField<string>;
	/** High/ambient temperature in Fahrenheit (numeric). */
	temperature: ParsedField<number>;
	/** Free-text summary of work performed. */
	work_performed: ParsedField<string>;
	/** Beginning station of paved segment (e.g. "100+00"). */
	stations_from: ParsedField<string>;
	/** Ending station of paved segment. */
	stations_to: ParsedField<string>;
	/** Total tonnage placed today. */
	tonnage_placed: ParsedField<number>;
	/** Equipment on site (free-text list). */
	equipment_on_site: ParsedField<string>;
	/** Issues or deficiencies noted. */
	issues_noted: ParsedField<string>;
	/** Specification compliance notes. */
	spec_compliance_notes: ParsedField<string>;
	/** Warnings / fields we couldn't parse. */
	warnings: string[];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Returns true when the document text strongly resembles a GDOT daily
 * inspection / construction report.
 */
export function isInspectionReport(text: string): boolean {
	return (
		/DAILY REPORT OF CONSTRUCTION|INSPECTOR'?S?\s+DAILY\s+REPORT/i.test(text) ||
		(/DAILY\s+(WORK\s+)?REPORT/i.test(text) && /INSPECTOR|GDOT|CONTRACTOR/i.test(text))
	);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function emptyResult(): ParsedInspectionReport {
	const missing = <T>(src: string): ParsedField<T> => ({
		value: null,
		confidence: 'low',
		source: src
	});
	return {
		date: missing('not found'),
		inspector_name: missing('not found'),
		contractor: missing('not found'),
		weather: missing('not found'),
		temperature: missing('not found'),
		work_performed: missing('not found'),
		stations_from: missing('not found'),
		stations_to: missing('not found'),
		tonnage_placed: missing('not found'),
		equipment_on_site: missing('not found'),
		issues_noted: missing('not found'),
		spec_compliance_notes: missing('not found'),
		warnings: []
	};
}

function toNumber(raw: string | null | undefined): number | null {
	if (raw == null) return null;
	const cleaned = raw.replace(/[$,\s]/g, '');
	const n = Number(cleaned);
	return Number.isFinite(n) && cleaned !== '' ? n : null;
}

/** Normalise a date string to ISO (YYYY-MM-DD) when possible. */
function normaliseDate(raw: string): string {
	// MM/DD/YYYY or MM-DD-YYYY
	const mdy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(raw.trim());
	if (mdy) {
		const [, m, d, y] = mdy;
		return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
	}
	// YYYY-MM-DD already
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
	return raw.trim();
}

/** Extract the value following a label like "DATE:" or "INSPECTOR:" */
function afterLabel(text: string, labelRe: RegExp): string | null {
	const m = labelRe.exec(text);
	if (!m) return null;
	// Capture everything after the label up to end-of-line or next label pattern.
	const rest = text.slice(m.index + m[0].length);
	const line = /^[^\n\r]{1,120}/.exec(rest)?.[0] ?? '';
	const val = line.replace(/^\s*:?\s*/, '').trim();
	return val || null;
}

/** Grab text between two headings (both patterns). */
function zoneBetween(text: string, startRe: RegExp, endRe: RegExp): string | null {
	const start = startRe.exec(text);
	if (!start) return null;
	const slice = text.slice(start.index + start[0].length);
	const end = endRe.exec(slice);
	const region = end ? slice.slice(0, end.index) : slice.slice(0, 500);
	return region.replace(/^\s+/, '').replace(/\s+$/, '') || null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a GDOT daily inspection / construction report from extracted PDF text.
 *
 * @param text  Full concatenated text from all pages of the document.
 */
export function parseInspectionReport(text: string): ParsedInspectionReport {
	const result = emptyResult();

	if (!isInspectionReport(text)) {
		result.warnings.push(
			'Document does not match expected daily inspection report headers (DAILY REPORT OF CONSTRUCTION / INSPECTOR\'S DAILY REPORT).'
		);
		return result;
	}

	// --- Date ---
	// "DATE: 05/21/2025", "Date: May 21, 2025", "REPORT DATE: ..."
	const dateRaw =
		afterLabel(text, /\bREPORT\s+DATE\s*:?\s*/i) ??
		afterLabel(text, /\bDATE\s*:?\s*/i);
	if (dateRaw) {
		// Extract the first date-like token from the captured value.
		const datePart =
			/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.exec(dateRaw)?.[0] ??
			/\d{4}-\d{2}-\d{2}/.exec(dateRaw)?.[0];
		if (datePart) {
			result.date = field.high(normaliseDate(datePart), 'regex_label_DATE', dateRaw);
		} else {
			result.date = field.medium(normaliseDate(dateRaw.split(/\s+/).slice(0, 3).join(' ')), 'regex_label_DATE', dateRaw);
		}
	}

	// --- Inspector ---
	const inspRaw =
		afterLabel(text, /INSPECTOR(?:'?S)?\s+NAME\s*:?\s*/i) ??
		afterLabel(text, /INSPECTOR\s*:?\s*/i) ??
		afterLabel(text, /INSPECTED\s+BY\s*:?\s*/i);
	if (inspRaw) {
		result.inspector_name = field.high(inspRaw.split(/\n/)[0].trim(), 'regex_label_INSPECTOR', inspRaw);
	}

	// --- Contractor ---
	const contractorRaw =
		afterLabel(text, /PRIME\s+CONTRACTOR\s*:?\s*/i) ??
		afterLabel(text, /CONTRACTOR\s*:?\s*/i);
	if (contractorRaw) {
		result.contractor = field.high(contractorRaw.split(/\n/)[0].trim(), 'regex_label_CONTRACTOR', contractorRaw);
	}

	// --- Weather ---
	const weatherRaw =
		afterLabel(text, /WEATHER\s+CONDITIONS?\s*:?\s*/i) ??
		afterLabel(text, /WEATHER\s*:?\s*/i);
	if (weatherRaw) {
		// Take first 60 chars; weather fields are typically short.
		result.weather = field.high(weatherRaw.slice(0, 60).split(/\n/)[0].trim(), 'regex_label_WEATHER', weatherRaw);
	}

	// --- Temperature ---
	// "TEMPERATURE: 78°F", "TEMP: 78", "HIGH TEMP: 82 F"
	const tempRaw =
		afterLabel(text, /(?:HIGH\s+)?TEMP(?:ERATURE)?\s*:?\s*/i);
	if (tempRaw) {
		const numMatch = /(\d{2,3})\s*(?:°?F|FAHRENHEIT|DEGREES)?/.exec(tempRaw);
		if (numMatch) {
			const n = toNumber(numMatch[1]);
			if (n !== null) {
				result.temperature = field.high(n, 'regex_label_TEMP', tempRaw);
			}
		}
	}

	// --- Work performed ---
	// Look for a labelled section or block.
	const workZone =
		zoneBetween(text, /WORK\s+PERFORMED\s*:?\s*/i, /EQUIPMENT|TONNAGE|STATIONS?\s+PAVED|ISSUES|COMPLIANCE|SPEC\b/i) ??
		afterLabel(text, /WORK\s+PERFORMED\s*:?\s*/i) ??
		afterLabel(text, /DESCRIPTION\s+OF\s+WORK\s*:?\s*/i);
	if (workZone) {
		result.work_performed = field.medium(workZone.slice(0, 600).trim(), 'regex_section_WORK_PERFORMED', workZone);
	}

	// --- Stations paved ---
	// "STATION FROM: 100+00  TO: 105+50"
	// "STATIONS PAVED: 100+00 TO 105+50"
	const stationsLine =
		afterLabel(text, /STATIONS?\s+(?:PAVED\s*)?:?\s*/i) ??
		afterLabel(text, /BEGIN(?:NING)?\s+STATION\s*:?\s*/i);
	if (stationsLine) {
		const stRe = /(\d+\+\d+(?:\.\d+)?)\s+(?:TO\s+)?(\d+\+\d+(?:\.\d+)?)/i.exec(stationsLine);
		if (stRe) {
			result.stations_from = field.high(stRe[1], 'regex_stations_pair', stationsLine);
			result.stations_to = field.high(stRe[2], 'regex_stations_pair', stationsLine);
		} else {
			// Single station — treat as "from"
			const singleSt = /(\d+\+\d+(?:\.\d+)?)/.exec(stationsLine);
			if (singleSt) {
				result.stations_from = field.medium(singleSt[1], 'regex_station_single', stationsLine);
			}
		}
	}
	// Separate FROM / TO labels
	if (result.stations_from.value === null) {
		const fromRaw = afterLabel(text, /(?:STATION\s+)?FROM\s*:?\s*/i);
		if (fromRaw) {
			const st = /(\d+\+\d+(?:\.\d+)?)/.exec(fromRaw);
			if (st) result.stations_from = field.high(st[1], 'regex_label_FROM_station', fromRaw);
		}
	}
	if (result.stations_to.value === null) {
		const toRaw = afterLabel(text, /(?:STATION\s+)?TO\s*:?\s*/i);
		if (toRaw) {
			const st = /(\d+\+\d+(?:\.\d+)?)/.exec(toRaw);
			if (st) result.stations_to = field.high(st[1], 'regex_label_TO_station', toRaw);
		}
	}

	// --- Tonnage placed ---
	// "TONNAGE PLACED: 425.5", "TONS PLACED: 425", "TOTAL TONS: 210"
	const tonnageRaw =
		afterLabel(text, /TONNAGE\s+PLACED\s*:?\s*/i) ??
		afterLabel(text, /TONS?\s+PLACED\s*:?\s*/i) ??
		afterLabel(text, /TOTAL\s+TONS?\s*:?\s*/i);
	if (tonnageRaw) {
		const n = toNumber(/[\d,]+(?:\.\d+)?/.exec(tonnageRaw)?.[0]);
		if (n !== null) {
			result.tonnage_placed = field.high(n, 'regex_label_TONNAGE', tonnageRaw);
		}
	}

	// --- Equipment ---
	const equipZone =
		zoneBetween(text, /EQUIPMENT\s+(?:ON\s+SITE\s+|USED\s+)?:?\s*/i, /TONNAGE|WORK\s+PERFORMED|ISSUES|COMPLIANCE|SPEC\b|SUMMARY/i) ??
		afterLabel(text, /EQUIPMENT\s+(?:ON\s+SITE\s+|USED\s+)?:?\s*/i);
	if (equipZone) {
		result.equipment_on_site = field.medium(equipZone.slice(0, 500).trim(), 'regex_section_EQUIPMENT', equipZone);
	}

	// --- Issues noted ---
	const issuesZone =
		zoneBetween(text, /ISSUES?\s+(?:NOTED|OBSERVED|IDENTIFIED)?\s*:?\s*/i, /COMPLIANCE|SPEC\b|EQUIPMENT|SUMMARY|SIGNATURE/i) ??
		afterLabel(text, /DEFICIENC(?:Y|IES)\s*:?\s*/i);
	if (issuesZone) {
		result.issues_noted = field.medium(issuesZone.slice(0, 500).trim(), 'regex_section_ISSUES', issuesZone);
	}

	// --- Spec compliance notes ---
	const specZone =
		zoneBetween(text, /SPEC(?:IFICATION)?\s+COMPLIANCE\s*:?\s*/i, /SIGNATURE|SUMMARY|ISSUES|EQUIPMENT/i) ??
		afterLabel(text, /SPEC(?:IFICATION)?\s+COMPLIANCE\s*:?\s*/i) ??
		afterLabel(text, /COMPLIANCE\s+NOTES?\s*:?\s*/i);
	if (specZone) {
		result.spec_compliance_notes = field.medium(specZone.slice(0, 500).trim(), 'regex_section_SPEC_COMPLIANCE', specZone);
	}

	// Warn about any fields still missing.
	const missing: string[] = [];
	if (result.date.value === null) missing.push('date');
	if (result.inspector_name.value === null) missing.push('inspector_name');
	if (result.contractor.value === null) missing.push('contractor');
	if (result.tonnage_placed.value === null) missing.push('tonnage_placed');
	if (missing.length > 0) {
		result.warnings.push(`Could not extract: ${missing.join(', ')}.`);
	}

	return result;
}
