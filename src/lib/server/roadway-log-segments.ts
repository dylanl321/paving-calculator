/**
 * Dynamic segmentation of homogeneous spans between roadway log events.
 * Port of test.py build_segments().
 */

const OP_SPLIT_RE = /\b(BEGIN|END|CONTINUE)\b/gi;

export interface LogSegmentEvent {
	milepost: number;
	event_type?: string;
	description: string;
	roadway_width_ft?: number | null;
}

export interface LogSegment {
	fromMeasure: number;
	toMeasure: number;
	lengthMi: number;
	widthFt: number | null;
	activeTreatments: string[];
	startEventLabel: string;
	endEventLabel: string;
}

function segmentKey(phrase: string): string {
	return phrase.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 48);
}

function parseOperations(text: string): { begins: string[]; ends: string[] } {
	const begins: string[] = [];
	const ends: string[] = [];
	const tokens = text.split(OP_SPLIT_RE);
	for (let i = 1; i < tokens.length - 1; i += 2) {
		const kw = tokens[i].toUpperCase();
		const phrase = tokens[i + 1].trim().replace(/^[ .,-]+|[ .,-]+$/g, '');
		if (!phrase) continue;
		const short = phrase.replace(/\s+/g, ' ').slice(0, 120);
		if (kw === 'BEGIN') begins.push(short);
		else if (kw === 'END') ends.push(short);
	}
	return { begins, ends };
}

function parseSideRoad(text: string): { name: string; side: string; paved: boolean } | null {
	const parts = text.split(',').map((p) => p.trim());
	if (parts.length < 2) return null;
	const name = parts[0]
		.split(/\s+/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join(' ');
	const side = parts.find((p) => /^(LEFT|RIGHT)$/i.test(p));
	if (!side) return null;
	const up = text.toUpperCase();
	const paved = up.includes('UNPAVED') ? false : up.includes('PAVED') ? true : false;
	return { name, side: side.charAt(0).toUpperCase() + side.slice(1).toLowerCase(), paved };
}

export function eventLabel(event: LogSegmentEvent): string {
	if (event.event_type === 'side_road') {
		const sr = parseSideRoad(event.description);
		if (sr) {
			const paved = sr.paved ? 'paved' : 'unpaved';
			return `${sr.name} (${sr.side}, ${paved})`;
		}
	}
	const type = event.event_type?.replace(/_/g, ' ') ?? 'note';
	return type.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildLogSegments(events: LogSegmentEvent[]): LogSegment[] {
	const segs: LogSegment[] = [];
	const active = new Map<string, string>();
	let currentWidth: number | null = null;
	const ordered = [...events].sort((a, b) => a.milepost - b.milepost);

	for (let idx = 0; idx < ordered.length; idx++) {
		const ev = ordered[idx];
		const { begins, ends } = parseOperations(ev.description);
		for (const p of ends) active.delete(segmentKey(p));
		for (const p of begins) active.set(segmentKey(p), p);
		if (ev.roadway_width_ft != null) currentWidth = ev.roadway_width_ft;

		const nxt = ordered[idx + 1];
		if (!nxt || nxt.milepost <= ev.milepost) continue;

		segs.push({
			fromMeasure: ev.milepost,
			toMeasure: nxt.milepost,
			lengthMi: Math.round((nxt.milepost - ev.milepost) * 1e4) / 1e4,
			widthFt: currentWidth,
			activeTreatments: [...active.values()].sort(),
			startEventLabel: eventLabel(ev),
			endEventLabel: eventLabel(nxt)
		});
	}
	return segs;
}
