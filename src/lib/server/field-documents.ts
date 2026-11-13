import type { D1Database } from '../../cloudflare';
import { DbHelper } from '$lib/server/db';
import { DbLogHelper } from '$lib/server/db-logs';

export type FieldDocumentKind = 'weight_ticket' | 'material_certification' | 'daily_report';

export interface WeightTicketFields {
	tons: number | null;
	mix: string | null;
	truck: string | null;
	ticket_number: string | null;
	time: string | null;
	date: string | null;
}

export interface MaterialCertFields {
	material: string | null;
	spec: string | null;
	supplier: string | null;
	category: 'aggregate' | 'asphalt' | 'soil' | 'concrete' | 'other';
}

export interface DailyReportFields {
	date: string | null;
	tons: number | null;
	weather: 'clear' | 'cloudy' | 'rain' | 'wind' | 'fog' | null;
	temp_f: number | null;
	notes: string | null;
	crew_count: number | null;
}

export type FieldDocumentDraft =
	| { kind: 'weight_ticket'; fields: WeightTicketFields }
	| { kind: 'material_certification'; fields: MaterialCertFields }
	| { kind: 'daily_report'; fields: DailyReportFields };

const WEATHER = new Set(['clear', 'cloudy', 'rain', 'wind', 'fog']);
const CATEGORIES = new Set(['aggregate', 'asphalt', 'soil', 'concrete', 'other']);

function lineValue(text: string, labels: string[]): string | null {
	for (const label of labels) {
		const match = text.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*[:#-]\\s*(.+)$`, 'im'));
		if (match?.[1]) {
			const value = match[1].trim();
			if (value) return value.slice(0, 200);
		}
	}
	return null;
}

function numberValue(text: string, labels: string[]): number | null {
	const raw = lineValue(text, labels);
	if (raw) {
		const n = Number(raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0] ?? '');
		if (Number.isFinite(n)) return n;
	}
	return null;
}

function isoDate(value: string | null): string | null {
	if (!value) return null;
	const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
	if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
	const us = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
	if (us) {
		const month = us[1].padStart(2, '0');
		const day = us[2].padStart(2, '0');
		return `${us[3]}-${month}-${day}`;
	}
	return null;
}

function clock(value: string | null): string | null {
	if (!value) return null;
	const match = value.match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/);
	if (!match) return null;
	let hour = Number(match[1]);
	const minute = match[2];
	const ampm = match[3]?.toLowerCase();
	if (ampm === 'pm' && hour < 12) hour += 12;
	if (ampm === 'am' && hour === 12) hour = 0;
	if (hour > 23) return null;
	return `${String(hour).padStart(2, '0')}:${minute}`;
}

/**
 * Pull structured fields out of a weight ticket, material certification, or
 * daily report. Returns null when the text does not look like one of those.
 */
export function extractFieldDocument(text: string): FieldDocumentDraft | null {
	const sample = text.slice(0, 20000);
	const head = sample.slice(0, 800).toLowerCase();

	const looksTicket = /weight\s*ticket|truck\s*ticket|net\s*(?:wt|weight)|ticket\s*(?:no|number|#)/i.test(
		sample
	);
	const looksCert = /material\s+cert|certification|test\s+report|job\s+mix/i.test(head);
	const looksDaily = /daily\s+(?:report|work|production)|foreman'?s?\s+daily/i.test(head);

	if (looksTicket && !looksDaily) {
		const tons =
			numberValue(sample, ['net tons', 'net weight', 'net wt', 'tons', 'tonnage']) ??
			(() => {
				const match = sample.match(/(\d+(?:\.\d+)?)\s*(?:tons?|tn)\b/i);
				return match ? Number(match[1]) : null;
			})();
		return {
			kind: 'weight_ticket',
			fields: {
				tons,
				mix: lineValue(sample, ['mix', 'mix type', 'material', 'product']),
				truck: lineValue(sample, ['truck', 'truck no', 'truck number', 'hauler']),
				ticket_number: lineValue(sample, ['ticket', 'ticket no', 'ticket number', 'ticket #']),
				time: clock(lineValue(sample, ['time', 'load time', 'printed'])),
				date: isoDate(lineValue(sample, ['date', 'load date']))
			}
		};
	}

	if (looksCert && !looksDaily) {
		const categoryRaw = (lineValue(sample, ['category']) ?? '').toLowerCase();
		const category = CATEGORIES.has(categoryRaw)
			? (categoryRaw as MaterialCertFields['category'])
			: /concrete/i.test(sample)
				? 'concrete'
				: /aggregate|gab|stone|base/i.test(sample)
					? 'aggregate'
					: /soil|subgrade/i.test(sample)
						? 'soil'
						: /asphalt|hma|mix/i.test(sample)
							? 'asphalt'
							: 'other';
		return {
			kind: 'material_certification',
			fields: {
				material: lineValue(sample, ['material', 'product', 'mix', 'description']),
				spec: lineValue(sample, ['spec', 'specification', 'gdot spec', 'standard']),
				supplier: lineValue(sample, ['supplier', 'producer', 'plant', 'source']),
				category
			}
		};
	}

	if (looksDaily) {
		const weatherRaw = (lineValue(sample, ['weather', 'conditions']) ?? '').toLowerCase();
		const weather = WEATHER.has(weatherRaw) ? (weatherRaw as DailyReportFields['weather']) : null;
		return {
			kind: 'daily_report',
			fields: {
				date: isoDate(lineValue(sample, ['date', 'report date'])),
				tons: numberValue(sample, ['tons placed', 'tons', 'tonnage', 'total tons']),
				weather,
				temp_f: numberValue(sample, ['temp', 'temperature', 'temp f']),
				notes: lineValue(sample, ['notes', 'remarks', 'comments']),
				crew_count: numberValue(sample, ['crew', 'crew count', 'crew size'])
			}
		};
	}

	return null;
}

export interface CommitResult {
	kind: FieldDocumentKind;
	id: string;
	summary: string;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value != null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function textField(value: unknown, max: number): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, max);
}

function numField(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const n = Number(value);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

/**
 * Save a document the user has already reviewed. Nothing is written until
 * this is called with the confirmed fields.
 */
export async function commitFieldDocument(
	db: D1Database,
	input: {
		jobSiteId: string;
		orgId: string;
		userId: string;
		kind: string;
		fields: unknown;
		filename?: string | null;
	}
): Promise<CommitResult> {
	const helper = new DbHelper(db);
	const fields = asRecord(input.fields);
	const now = Math.floor(Date.now() / 1000);

	if (input.kind === 'weight_ticket') {
		const tons = numField(fields.tons);
		if (tons == null || tons <= 0) {
			throw new Error('Tons must be a positive number');
		}
		const ticket = textField(fields.ticket_number, 80) ?? textField(fields.truck, 80);
		const mix = textField(fields.mix, 120);
		const time = clock(textField(fields.time, 20));
		const date = isoDate(textField(fields.date, 20));
		let timestamp = now;
		if (date && time) {
			const [hour, minute] = time.split(':').map(Number);
			const [year, month, day] = date.split('-').map(Number);
			timestamp = Math.floor(new Date(year, month - 1, day, hour, minute).getTime() / 1000);
		}
		const notes = [mix ? `Mix: ${mix}` : null, textField(fields.truck, 80) ? `Truck: ${textField(fields.truck, 80)}` : null]
			.filter(Boolean)
			.join(' · ');
		const id = crypto.randomUUID();
		await db
			.prepare(
				'INSERT INTO loads (id, job_site_id, user_id, ticket_number, tons, timestamp, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(id, input.jobSiteId, input.userId, ticket, tons, timestamp, notes || null, now)
			.run();
		return { kind: 'weight_ticket', id, summary: `Saved ${tons} ton load` };
	}

	if (input.kind === 'material_certification') {
		const material = textField(fields.material, 120);
		if (!material) throw new Error('Material name is required');
		const categoryRaw = textField(fields.category, 40)?.toLowerCase() ?? 'other';
		const category = CATEGORIES.has(categoryRaw) ? categoryRaw : 'other';
		const supplier = textField(fields.supplier, 120);
		const spec = textField(fields.spec, 120);
		const job = await helper.getJobSiteById(input.jobSiteId);
		const notes = [
			spec ? `Spec: ${spec}` : null,
			job ? `Project: ${job.name} (${job.id})` : null
		]
			.filter(Boolean)
			.join('\n');
		const id = crypto.randomUUID();
		await db
			.prepare(
				`INSERT INTO org_materials (id, org_id, name, category, supplier, notes, is_active, sort_order, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)`
			)
			.bind(id, input.orgId, material, category, supplier, notes || null, now)
			.run();
		await helper.createJobDocument(input.jobSiteId, {
			r2_key: `field-documents/${input.orgId}/${id}.txt`,
			filename: input.filename?.trim() || `${material} certification`,
			doc_type: 'material_certification',
			content_type: 'text/plain'
		});
		return { kind: 'material_certification', id, summary: `Attached ${material}` };
	}

	if (input.kind === 'daily_report') {
		const date = isoDate(textField(fields.date, 20));
		if (!date) throw new Error('Report date must be YYYY-MM-DD or MM/DD/YYYY');
		const logs = new DbLogHelper(db);
		let log = await logs.getDailyLog(input.jobSiteId, date);
		if (!log) {
			log = await logs.createDailyLog(input.jobSiteId, date, input.userId);
		}
		const weatherRaw = textField(fields.weather, 20)?.toLowerCase() ?? null;
		const weather = weatherRaw && WEATHER.has(weatherRaw) ? weatherRaw : null;
		const temp = numField(fields.temp_f);
		const crew = numField(fields.crew_count);
		const notes = textField(fields.notes, 2000);
		await db
			.prepare(
				`UPDATE daily_logs
				 SET weather_conditions = COALESCE(?, weather_conditions),
				     weather_temp_f = COALESCE(?, weather_temp_f),
				     crew_count = COALESCE(?, crew_count),
				     notes = COALESCE(?, notes),
				     updated_at = ?
				 WHERE id = ?`
			)
			.bind(weather, temp, crew != null ? Math.round(crew) : null, notes, now, log.id)
			.run();
		const tons = numField(fields.tons);
		if (tons != null && tons > 0) {
			await logs.createLogEntry(log.id, {
				entry_type: 'paving',
				timestamp: '12:00',
				tons_placed: tons,
				notes: notes ?? 'Imported daily report'
			});
		}
		return { kind: 'daily_report', id: log.id, summary: `Saved daily report for ${date}` };
	}

	throw new Error('Unsupported document kind');
}
