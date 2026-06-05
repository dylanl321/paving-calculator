/**
 * terminus-parser.ts — parse GDOT terminus strings from PDF-parsed text.
 *
 * Recognizes:
 * - Intersection patterns: 'AT INTERSECTION OF CR 220', 'SR 13 AT CR 220'
 * - Milepost patterns: 'MP 12.345', 'MILEPOST 12.345'
 * - Landmark patterns: '0.3 MI NORTH OF GAINESVILLE'
 * - Raw: anything that doesn't match a known pattern
 */

export interface ParsedTerminus {
	type: 'intersection' | 'milepost' | 'landmark' | 'raw';
	parsed_roads: string[];
	milepost?: number;
	landmark?: string;
	offsetMiles?: number;
	direction?: string;
	summary: string;
	raw: string;
}

// Road name patterns (case-insensitive)
const ROAD_PATTERNS = [
	/\bSR\s+\d+\b/gi,
	/\bUS\s+\d+\b/gi,
	/\bCR\s+\d+\b/gi,
	/\bGA\s+\d+\b/gi,
	/\bI-\d+\b/gi,
	/\bHWY\s+\d+\b/gi,
	/\bHIGHWAY\s+\d+\b/gi
];

// State/county line patterns
const LINE_PATTERN = /\bTHE\s+([A-Z\s]+)\s+LINE\b/gi;

export function parseTerminus(terminus: string | null | undefined): ParsedTerminus | null {
	if (!terminus || typeof terminus !== 'string') return null;

	const normalized = terminus.trim().toUpperCase();
	if (!normalized) return null;

	// Try milepost pattern first
	const mileposterMatch = normalized.match(/\b(?:MP|MILEPOST)\s+([\d.]+)\b/i);
	if (mileposterMatch) {
		const milepost = parseFloat(mileposterMatch[1]);
		return {
			type: 'milepost',
			parsed_roads: [],
			milepost,
			summary: `milepost ${milepost.toFixed(3)}`,
			raw: terminus
		};
	}

	// Try landmark pattern: '0.3 MI NORTH OF GAINESVILLE'
	const landmarkMatch = normalized.match(/\b([\d.]+)\s+MI(?:LE)?S?\s+(NORTH|SOUTH|EAST|WEST)\s+OF\s+(.+)/i);
	if (landmarkMatch) {
		const offsetMiles = parseFloat(landmarkMatch[1]);
		const direction = landmarkMatch[2].toUpperCase();
		const landmark = landmarkMatch[3].trim();
		return {
			type: 'landmark',
			parsed_roads: [],
			offsetMiles,
			direction,
			landmark,
			summary: `${offsetMiles} mi ${direction.toLowerCase()} of ${landmark.toLowerCase()}`,
			raw: terminus
		};
	}

	// Extract all road names
	const roadNames: string[] = [];
	for (const pattern of ROAD_PATTERNS) {
		const matches = normalized.matchAll(pattern);
		for (const match of matches) {
			const road = match[0].trim();
			if (!roadNames.includes(road)) {
				roadNames.push(road);
			}
		}
	}

	// Check for state/county lines
	const lineMatches = normalized.matchAll(LINE_PATTERN);
	for (const match of lineMatches) {
		const lineName = `THE ${match[1].trim()} LINE`;
		return {
			type: 'landmark',
			parsed_roads: roadNames,
			landmark: lineName,
			summary: lineName.toLowerCase(),
			raw: terminus
		};
	}

	// Try intersection patterns
	const isIntersection =
		/\bAT\s+INTERSECTION\s+OF\b/i.test(normalized) ||
		/\bBEGIN\s+.*?\s+AT\b/i.test(normalized) ||
		/\bEND\s+.*?\s+AT\b/i.test(normalized) ||
		(/\bAT\b/.test(normalized) && roadNames.length >= 2);

	if (isIntersection && roadNames.length >= 2) {
		const summary = `intersection of ${roadNames.join(' and ').toLowerCase()}`;
		return {
			type: 'intersection',
			parsed_roads: roadNames,
			summary,
			raw: terminus
		};
	}

	// Check if single road in an intersection-like pattern
	if (isIntersection && roadNames.length === 1) {
		// Extract the unparsed part after 'AT' or 'OF'
		const atMatch = normalized.match(/\b(?:AT|OF)\s+(.+)/i);
		if (atMatch) {
			const remainder = atMatch[1].trim();
			// If remainder doesn't match any road pattern, treat it as a raw road name
			const hasRoadKeyword = /\b(?:SR|US|CR|GA|I-|HWY|HIGHWAY)\b/i.test(remainder);
			if (!hasRoadKeyword && remainder) {
				roadNames.push(remainder);
			}
		}
		if (roadNames.length >= 2) {
			const summary = `intersection of ${roadNames.join(' and ').toLowerCase()}`;
			return {
				type: 'intersection',
				parsed_roads: roadNames,
				summary,
				raw: terminus
			};
		}
	}

	// Raw fallback
	return {
		type: 'raw',
		parsed_roads: roadNames,
		summary: normalized.toLowerCase(),
		raw: terminus
	};
}
