/**
 * AI-powered document type classifier for PDF uploads.
 *
 * Uses Workers AI (LLM) for classification when the regex fast-path does not
 * produce a confident result. Falls back gracefully to regex-only behavior when
 * the AI binding is unavailable.
 *
 * Classification never blocks the upload flow — failures fall through to
 * 'unknown' rather than surfacing errors to the user.
 */

import type { WorkersAi } from './llm-fallback.js';
import { detectDocumentType } from './parse-gdot.js';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type DocumentClassType =
	| 'gdot_contract_summary'
	| 'gdot_job_setup'
	| 'gdot_roadway_log'
	| 'weight_ticket'
	| 'material_certification'
	| 'plan_sheet'
	| 'inspection_report'
	| 'change_order'
	| 'daily_report'
	| 'unknown';

export interface DocumentClassification {
	/** Machine-readable document category. */
	type: DocumentClassType;
	/** Confidence score 0–1. */
	confidence: number;
	/** Human-readable label, e.g. "GDOT Contract Summary". */
	description: string;
	/** Whether Workers AI was used (false = regex fast-path). */
	ai_used: boolean;
}

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

/** Workers AI model for classification. Same series as llm-fallback. */
const CLASSIFY_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

/** Maximum characters of document text sent to the AI for classification. */
const CLASSIFY_MAX_CHARS = 3000;

/** Confidence assigned to regex-detected GDOT types (high-certainty). */
const REGEX_CONFIDENCE = 0.85;

/** Default confidence when AI returns a match but no score. */
const AI_DEFAULT_CONFIDENCE = 0.6;

const VALID_TYPES: DocumentClassType[] = [
	'gdot_contract_summary',
	'gdot_job_setup',
	'gdot_roadway_log',
	'weight_ticket',
	'material_certification',
	'plan_sheet',
	'inspection_report',
	'change_order',
	'daily_report',
	'unknown'
];

const TYPE_DESCRIPTIONS: Record<DocumentClassType, string> = {
	gdot_contract_summary: 'GDOT Contract Summary',
	gdot_job_setup: 'GDOT Job Setup',
	gdot_roadway_log: 'GDOT Roadway Log',
	weight_ticket: 'Weight Ticket',
	material_certification: 'Material Certification',
	plan_sheet: 'Plan Sheet',
	inspection_report: 'Inspection Report',
	change_order: 'Change Order',
	daily_report: 'Daily Report',
	unknown: 'Unknown Document Type'
};

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

/** Map existing GdotDocumentType values to our broader DocumentClassType. */
function fromGdotType(gdotType: string): DocumentClassType {
	if (gdotType === 'contract_summary') return 'gdot_contract_summary';
	if (gdotType === 'job_setup') return 'gdot_job_setup';
	if (gdotType === 'inspection_report') return 'inspection_report';
	if (gdotType === 'change_order') return 'change_order';
	return 'unknown';
}

function unknownResult(): DocumentClassification {
	return {
		type: 'unknown',
		confidence: 0,
		description: TYPE_DESCRIPTIONS['unknown'],
		ai_used: false
	};
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Classify a document using the text extracted from its first two pages.
 *
 * Fast-path: regex detectDocumentType from parse-gdot.ts.
 * Slow-path: Workers AI LLM prompt when regex returns 'unknown' and AI binding
 * is available.
 *
 * @param ai   Workers AI binding from the platform env (may be undefined in dev).
 * @param textPages  Array of per-page text strings from pdfToPositionedText().
 */
export async function classifyDocument(
	ai: WorkersAi | undefined,
	textPages: string[]
): Promise<DocumentClassification> {
	// --- Regex fast-path ---
	const combinedText = textPages.slice(0, 2).join('\n\f\n');
	const gdotType = detectDocumentType(combinedText);

	if (gdotType !== 'unknown') {
		const type = fromGdotType(gdotType);
		return {
			type,
			confidence: REGEX_CONFIDENCE,
			description: TYPE_DESCRIPTIONS[type],
			ai_used: false
		};
	}

	// --- AI slow-path ---
	if (!ai) return unknownResult();

	const snippet = combinedText.slice(0, CLASSIFY_MAX_CHARS);

	const prompt =
		'You are a document classifier for construction and paving industry documents.\n' +
		'Classify the following document text into exactly ONE of these categories:\n' +
		'- gdot_contract_summary: GDOT contract summary with bid items and amounts\n' +
		'- gdot_job_setup: GDOT job setup with project details, mix designs, and schedules\n' +
		'- gdot_roadway_log: GDOT roadway log with milepost data\n' +
		'- weight_ticket: A load weight ticket or truck ticket\n' +
		'- material_certification: A material certification or quality test report\n' +
		'- plan_sheet: Engineering plan sheets or drawings\n' +
		'- inspection_report: A construction inspection report\n' +
		'- change_order: A contract change order\n' +
		'- daily_report: A daily work or production report\n' +
		'- unknown: Cannot determine the document type\n\n' +
		'Respond with valid JSON only, no explanation:\n' +
		'{"type": "<category>", "confidence": <0.0-1.0>, "description": "<short human-readable name>"}\n\n' +
		'Document text:\n' +
		snippet;

	try {
		const result = (await ai.run(CLASSIFY_MODEL, {
			messages: [{ role: 'user', content: prompt }],
			max_tokens: 120,
			response_format: { type: 'json_object' }
		})) as { response?: string } | null;

		const raw = result?.response ?? '';
		// Extract the first JSON object — AI sometimes prepends/appends prose.
		const jsonMatch = /\{[\s\S]*?\}/.exec(raw);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]) as {
				type?: unknown;
				confidence?: unknown;
				description?: unknown;
			};

			const rawType = typeof parsed.type === 'string' ? (parsed.type as DocumentClassType) : 'unknown';
			const safeType = VALID_TYPES.includes(rawType) ? rawType : 'unknown';
			const confidence =
				typeof parsed.confidence === 'number'
					? Math.min(1, Math.max(0, parsed.confidence))
					: AI_DEFAULT_CONFIDENCE;
			const description =
				typeof parsed.description === 'string' && parsed.description.length > 0
					? parsed.description
					: TYPE_DESCRIPTIONS[safeType];

			return { type: safeType, confidence, description, ai_used: true };
		}
	} catch {
		// AI binding error or JSON parse failure — degrade silently.
	}

	return unknownResult();
}

/**
 * Return a helpful user-facing message for documents that weren't parsed
 * (either unknown type or low-confidence non-GDOT types).
 */
export function getUnrecognizedMessage(classification: DocumentClassification): string {
	if (classification.type === 'unknown') {
		return (
			"We couldn't identify this document type. " +
			'We currently support GDOT contract summaries and job setup documents.'
		);
	}

	const messages: Partial<Record<DocumentClassType, string>> = {
		weight_ticket: 'This appears to be a Weight Ticket. Weight ticket import is coming soon.',
		material_certification:
			'This appears to be a Material Certification. Material cert import is coming soon.',
		plan_sheet:
			'This appears to be a Plan Sheet. We can extract project details if a contract summary is also uploaded.',
		inspection_report:
			'This appears to be a Daily Inspection Report. Inspection report data has been extracted — review it in the parsed results.',
		change_order:
			'This appears to be a Change Order. Change order data has been extracted — review it in the parsed results.',
		daily_report: 'This appears to be a Daily Report. Daily report import is not yet supported.',
		gdot_roadway_log:
			'This appears to be a GDOT Roadway Log. Please upload it alongside a contract summary for best results.'
	};

	return (
		messages[classification.type] ??
		`This appears to be a ${classification.description}. We don't recognize this document type yet.`
	);
}
