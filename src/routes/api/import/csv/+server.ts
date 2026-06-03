import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbLogHelper } from '$lib/server/db-logs';
import { requireAuth } from '$lib/server/auth';

const MAX_CSV_BYTES = 10 * 1024 * 1024; // 10 MB

interface ParsedCSV {
	bytes: ArrayBuffer;
	type: string;
}

// Reads the uploaded CSV from the request
async function readCSVUpload(request: Request): Promise<ParsedCSV | null> {
	const contentType = request.headers.get('content-type') ?? '';

	if (contentType.includes('multipart/form-data')) {
		try {
			const form = await request.clone().formData();
			const file = form.get('csv');
			if (file instanceof File) {
				return { bytes: await file.arrayBuffer(), type: file.type };
			}
		} catch {
			// fall through to manual parse
		}

		const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
		const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
		if (!boundary) return null;

		const raw = new Uint8Array(await request.arrayBuffer());
		return parseMultipart(raw, boundary, 'csv');
	}

	return null;
}

function parseMultipart(raw: Uint8Array, boundary: string, field: string): ParsedCSV | null {
	const text = new TextDecoder('latin1').decode(raw);
	const delimiter = `--${boundary}`;
	const parts = text.split(delimiter);

	for (const part of parts) {
		const headerEnd = part.indexOf('\r\n\r\n');
		if (headerEnd === -1) continue;
		const headers = part.slice(0, headerEnd);
		if (!new RegExp(`name="?${field}"?`, 'i').test(headers)) continue;

		const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(headers);
		const type = typeMatch?.[1]?.trim() ?? 'text/csv';

		const bodyStart = headerEnd + 4;
		let bodyEnd = part.length;
		if (part.endsWith('\r\n')) bodyEnd -= 2;

		const slice = raw.slice(byteOffset(text, part, bodyStart), byteOffset(text, part, bodyEnd));
		return { bytes: slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength), type };
	}

	return null;
}

function byteOffset(fullText: string, part: string, indexInPart: number): number {
	const partStart = fullText.indexOf(part);
	return partStart + indexInPart;
}

// Parse CSV manually - handle quoted fields
function parseCSV(text: string): string[][] {
	const rows: string[][] = [];
	const lines = text.split(/\r?\n/);

	for (const line of lines) {
		if (!line.trim()) continue;

		const row: string[] = [];
		let current = '';
		let inQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];

			if (char === '"') {
				if (inQuotes && line[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = !inQuotes;
				}
			} else if (char === ',' && !inQuotes) {
				row.push(current.trim());
				current = '';
			} else {
				current += char;
			}
		}

		row.push(current.trim());
		rows.push(row);
	}

	return rows;
}

// Normalize header name to canonical field name
function normalizeHeader(header: string): string {
	const lower = header.toLowerCase().trim();
	const map: Record<string, string> = {
		'date': 'date',
		'log_date': 'date',
		'station_start': 'station_start',
		'station_end': 'station_end',
		'distance_ft': 'distance_ft',
		'distance': 'distance_ft',
		'tons_placed': 'tons_placed',
		'tons': 'tons_placed',
		'loads_count': 'loads_count',
		'loads': 'loads_count',
		'spread_rate_actual': 'spread_rate_actual',
		'spread_rate': 'spread_rate_actual',
		'tack_gallons': 'tack_gallons',
		'tack': 'tack_gallons',
		'lane': 'lane',
		'notes': 'notes',
		'entry_type': 'entry_type',
		'timestamp': 'timestamp',
		'time': 'timestamp',
		'weather_temp_f': 'weather_temp_f',
		'temp': 'weather_temp_f',
		'weather_conditions': 'weather_conditions',
		'conditions': 'weather_conditions',
		'crew_count': 'crew_count',
		'crew': 'crew_count',
		'start_time': 'start_time',
		'end_time': 'end_time'
	};
	return map[lower] ?? lower;
}

interface ImportRow {
	date: string;
	entry_type: 'paving' | 'milling' | 'tack' | 'break' | 'delay' | 'note';
	timestamp: string;
	station_start?: number;
	station_end?: number;
	distance_ft?: number;
	tons_placed?: number;
	loads_count?: number;
	spread_rate_actual?: number;
	tack_gallons?: number;
	lane?: string;
	notes?: string;
	weather_temp_f?: number;
	weather_conditions?: 'clear' | 'cloudy' | 'rain' | 'wind' | 'fog';
	crew_count?: number;
	start_time?: string;
	end_time?: string;
}

export const POST: RequestHandler = async (event: RequestEvent) => {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const logHelper = new DbLogHelper(event.platform!.env.DB);

		const jobSiteId = event.url.searchParams.get('job_site_id');
		if (!jobSiteId) {
			return json({ error: 'job_site_id is required' }, { status: 400 });
		}

		const jobSite = await db.getJobSiteById(jobSiteId);
		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		const org = await db.getOrgByUserId(user.id);
		if (!org || org.id !== jobSite.org_id) {
			return json({ error: 'Access denied' }, { status: 403 });
		}

		const upload = await readCSVUpload(event.request);
		if (!upload) {
			return json({ error: 'No CSV file provided' }, { status: 400 });
		}

		if (upload.bytes.byteLength > MAX_CSV_BYTES) {
			return json({ error: 'CSV file must be 10 MB or smaller' }, { status: 400 });
		}

		const text = new TextDecoder('utf-8').decode(upload.bytes);
		const rows = parseCSV(text);

		if (rows.length < 2) {
			return json({ error: 'CSV must contain a header row and at least one data row' }, { status: 400 });
		}

		const headers = rows[0].map(normalizeHeader);
		const dataRows = rows.slice(1);

		const errors: string[] = [];
		const importRows: ImportRow[] = [];

		// Parse rows
		for (let i = 0; i < dataRows.length; i++) {
			const rowNum = i + 2; // +2 because 1-indexed and skip header
			const row = dataRows[i];

			try {
				const rowData: Record<string, string> = {};
				for (let j = 0; j < headers.length; j++) {
					rowData[headers[j]] = row[j] || '';
				}

				const date = rowData.date;
				if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
					errors.push(`Row ${rowNum}: Invalid or missing date (expected YYYY-MM-DD)`);
					continue;
				}

				const entryTypeRaw = rowData.entry_type?.toLowerCase() || 'paving';
				const validTypes = ['paving', 'milling', 'tack', 'break', 'delay', 'note'];
				const entryType = validTypes.includes(entryTypeRaw) ? entryTypeRaw : 'paving';

				const timestamp = rowData.timestamp || '08:00';
				if (!/^\d{1,2}:\d{2}$/.test(timestamp)) {
					errors.push(`Row ${rowNum}: Invalid timestamp (expected HH:MM)`);
					continue;
				}

				const importRow: ImportRow = {
					date,
					entry_type: entryType as ImportRow['entry_type'],
					timestamp
				};

				if (rowData.station_start) {
					const val = parseFloat(rowData.station_start);
					if (!isNaN(val)) importRow.station_start = val;
				}

				if (rowData.station_end) {
					const val = parseFloat(rowData.station_end);
					if (!isNaN(val)) importRow.station_end = val;
				}

				if (rowData.distance_ft) {
					const val = parseFloat(rowData.distance_ft);
					if (!isNaN(val)) importRow.distance_ft = val;
				}

				if (rowData.tons_placed) {
					const val = parseFloat(rowData.tons_placed);
					if (!isNaN(val)) importRow.tons_placed = val;
				}

				if (rowData.loads_count) {
					const val = parseInt(rowData.loads_count, 10);
					if (!isNaN(val)) importRow.loads_count = val;
				}

				if (rowData.spread_rate_actual) {
					const val = parseFloat(rowData.spread_rate_actual);
					if (!isNaN(val)) importRow.spread_rate_actual = val;
				}

				if (rowData.tack_gallons) {
					const val = parseFloat(rowData.tack_gallons);
					if (!isNaN(val)) importRow.tack_gallons = val;
				}

				if (rowData.lane) importRow.lane = rowData.lane;
				if (rowData.notes) importRow.notes = rowData.notes;

				if (rowData.weather_temp_f) {
					const val = parseFloat(rowData.weather_temp_f);
					if (!isNaN(val)) importRow.weather_temp_f = val;
				}

				if (rowData.weather_conditions) {
					const cond = rowData.weather_conditions.toLowerCase();
					if (['clear', 'cloudy', 'rain', 'wind', 'fog'].includes(cond)) {
						importRow.weather_conditions = cond as ImportRow['weather_conditions'];
					}
				}

				if (rowData.crew_count) {
					const val = parseInt(rowData.crew_count, 10);
					if (!isNaN(val)) importRow.crew_count = val;
				}

				if (rowData.start_time) {
					if (/^\d{1,2}:\d{2}$/.test(rowData.start_time)) {
						importRow.start_time = rowData.start_time;
					}
				}

				if (rowData.end_time) {
					if (/^\d{1,2}:\d{2}$/.test(rowData.end_time)) {
						importRow.end_time = rowData.end_time;
					}
				}

				importRows.push(importRow);
			} catch (err) {
				errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : 'Parse error'}`);
			}
		}

		if (importRows.length === 0) {
			return json({ error: 'No valid rows to import', errors }, { status: 400 });
		}

		// Group by date
		const byDate = new Map<string, ImportRow[]>();
		for (const row of importRows) {
			const existing = byDate.get(row.date) || [];
			existing.push(row);
			byDate.set(row.date, existing);
		}

		let imported = 0;

		// Process each date
		for (const [date, dateRows] of byDate.entries()) {
			let dailyLog = await logHelper.getDailyLog(jobSiteId, date);

			// Create or update daily log
			if (!dailyLog) {
				dailyLog = await logHelper.createDailyLog(jobSiteId, date, user.id);
			}

			// Update daily log header fields from first row with those fields
			const firstRow = dateRows.find(r => r.weather_temp_f || r.weather_conditions || r.crew_count || r.start_time || r.end_time);
			if (firstRow) {
				await logHelper.updateDailyLog(dailyLog.id, {
					weather_temp_f: firstRow.weather_temp_f ?? dailyLog.weather_temp_f,
					weather_conditions: firstRow.weather_conditions ?? dailyLog.weather_conditions,
					crew_count: firstRow.crew_count ?? dailyLog.crew_count,
					start_time: firstRow.start_time ?? dailyLog.start_time,
					end_time: firstRow.end_time ?? dailyLog.end_time
				});
			}

			// Create log entries
			for (const row of dateRows) {
				await logHelper.createLogEntry(dailyLog.id, {
					entry_type: row.entry_type,
					timestamp: row.timestamp,
					station_start: row.station_start,
					station_end: row.station_end,
					distance_ft: row.distance_ft,
					tons_placed: row.tons_placed,
					loads_count: row.loads_count,
					spread_rate_actual: row.spread_rate_actual,
					tack_gallons: row.tack_gallons,
					lane: row.lane,
					notes: row.notes
				});

				imported++;
			}
		}

		return json({
			imported,
			dates: byDate.size,
			errors: errors.length > 0 ? errors : undefined
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('CSV import error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

import type { RequestHandler } from './$types';
