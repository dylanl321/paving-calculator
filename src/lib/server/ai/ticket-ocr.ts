/**
 * Workers AI vision-based OCR for weight ticket extraction.
 *
 * Uses Cloudflare Workers AI vision model (@cf/unum/uform-gen2-qwen-500m)
 * to extract structured data from truck weight ticket photos.
 *
 * Best-effort: any error returns all fields as null/low confidence.
 * The user can always fill fields manually.
 */

/** Minimal shape of the env.AI binding (avoids a hard Ai type dep). */
export interface WorkersAi {
	run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export type FieldConfidence = "high" | "medium" | "low";

export interface TicketField<T> {
	value: T | null;
	confidence: FieldConfidence;
}

export interface TicketExtraction {
	truck_number: TicketField<string>;
	gross_weight: TicketField<number>; // in US short tons
	tare_weight: TicketField<number>; // in US short tons
	net_weight: TicketField<number>; // in US short tons
	material_type: TicketField<string>;
	plant_name: TicketField<string>;
	ticket_number: TicketField<string>;
	load_timestamp: TicketField<string>; // as read from ticket
	validation_errors: string[];
}

export const VISION_MODEL = "@cf/unum/uform-gen2-qwen-500m";

const EXTRACTION_PROMPT =
	"Extract from this weight ticket: truck number, gross weight, tare weight, net weight, " +
	"material type, plant name, ticket number, and date/time. Return ONLY valid JSON with " +
	"these exact fields: truck_number, gross_weight_tons, tare_weight_tons, net_weight_tons, " +
	"material_type, plant_name, ticket_number, timestamp. Use null for any field you cannot " +
	"read clearly. Weights must be numbers in US short tons (divide lbs by 2000 if needed).";

/**
 * Extract a JSON object from text that may contain additional content.
 * Tries parsing the whole text first, then looks for a JSON object pattern.
 */
export function extractJsonFromText(text: string): Record<string, unknown> | null {
	// Try parsing the whole text as JSON
	try {
		const parsed = JSON.parse(text);
		if (parsed && typeof parsed === "object") {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// Continue to regex extraction
	}

	// Try to find a JSON object in the text using regex
	const jsonMatch = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
	if (jsonMatch) {
		try {
			const parsed = JSON.parse(jsonMatch[0]);
			if (parsed && typeof parsed === "object") {
				return parsed as Record<string, unknown>;
			}
		} catch {
			return null;
		}
	}

	return null;
}

/**
 * Parse a weight value and convert to tons if needed.
 * If value > 200, assumes it's in pounds and divides by 2000.
 * Returns null if not a finite positive number.
 */
function parseWeightTons(v: unknown): number | null {
	if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
		return null;
	}
	// If > 200, assume pounds (typical truck load is 20-40 tons, not 200+ tons)
	if (v > 200) {
		return v / 2000;
	}
	return v;
}

/**
 * Create an empty TicketExtraction with all fields null and low confidence.
 */
function emptyExtraction(): TicketExtraction {
	return {
		truck_number: { value: null, confidence: "low" },
		gross_weight: { value: null, confidence: "low" },
		tare_weight: { value: null, confidence: "low" },
		net_weight: { value: null, confidence: "low" },
		material_type: { value: null, confidence: "low" },
		plant_name: { value: null, confidence: "low" },
		ticket_number: { value: null, confidence: "low" },
		load_timestamp: { value: null, confidence: "low" },
		validation_errors: []
	};
}

/**
 * Extract structured ticket data from a weight ticket photo.
 *
 * @param ai - Workers AI binding
 * @param imageBytes - Photo data as ArrayBuffer
 * @returns Extracted fields with confidence levels, or all null on error
 */
export async function extractTicketData(
	ai: WorkersAi,
	imageBytes: ArrayBuffer
): Promise<TicketExtraction> {
	try {
		// Convert ArrayBuffer to base64 (Workers-compatible)
		const uint8 = new Uint8Array(imageBytes);
		let binary = "";
		for (let i = 0; i < uint8.length; i++) {
			binary += String.fromCharCode(uint8[i]);
		}
		const base64 = btoa(binary);

		// Call Workers AI vision model
		const raw = await ai.run(VISION_MODEL, {
			image: base64,
			prompt: EXTRACTION_PROMPT,
			max_tokens: 512
		});

		// Workers AI vision models return { description: string }
		const description = raw && typeof raw === "object" && "description" in raw
			? (raw as { description: unknown }).description
			: null;

		if (typeof description !== "string") {
			return emptyExtraction();
		}

		// Extract JSON from the description
		const parsed = extractJsonFromText(description);
		if (!parsed) {
			return emptyExtraction();
		}

		// Extract and parse weights
		const grossWeight = parseWeightTons(parsed.gross_weight_tons);
		const tareWeight = parseWeightTons(parsed.tare_weight_tons);
		const netWeight = parseWeightTons(parsed.net_weight_tons);

		// Validate weights
		const validationErrors: string[] = [];

		// Check if net = gross - tare (within tolerance)
		if (grossWeight !== null && tareWeight !== null && netWeight !== null) {
			const expected = grossWeight - tareWeight;
			if (Math.abs(netWeight - expected) > 0.1) {
				validationErrors.push("net weight does not match gross minus tare");
			}
		}

		// Check weight ranges (typical truck loads: 1-40 tons)
		const weights = [grossWeight, tareWeight, netWeight];
		for (const w of weights) {
			if (w !== null && (w < 1 || w > 40)) {
				validationErrors.push("weight out of expected range");
				break;
			}
		}

		// Determine confidence level
		const hasValidWeights = netWeight !== null || (grossWeight !== null && tareWeight !== null);
		const hasValidation = validationErrors.length > 0;

		let confidence: FieldConfidence;
		if (hasValidWeights && !hasValidation) {
			confidence = "high";
		} else if (hasValidWeights) {
			confidence = "medium";
		} else {
			confidence = "low";
		}

		// Clean string values
		const cleanStr = (v: unknown): string | null => {
			if (typeof v === "string") {
				const s = v.trim();
				return s === "" ? null : s;
			}
			return null;
		};

		return {
			truck_number: {
				value: cleanStr(parsed.truck_number),
				confidence: cleanStr(parsed.truck_number) ? confidence : "low"
			},
			gross_weight: {
				value: grossWeight,
				confidence: grossWeight !== null ? confidence : "low"
			},
			tare_weight: {
				value: tareWeight,
				confidence: tareWeight !== null ? confidence : "low"
			},
			net_weight: {
				value: netWeight,
				confidence: netWeight !== null ? confidence : "low"
			},
			material_type: {
				value: cleanStr(parsed.material_type),
				confidence: cleanStr(parsed.material_type) ? confidence : "low"
			},
			plant_name: {
				value: cleanStr(parsed.plant_name),
				confidence: cleanStr(parsed.plant_name) ? confidence : "low"
			},
			ticket_number: {
				value: cleanStr(parsed.ticket_number),
				confidence: cleanStr(parsed.ticket_number) ? confidence : "low"
			},
			load_timestamp: {
				value: cleanStr(parsed.timestamp),
				confidence: cleanStr(parsed.timestamp) ? confidence : "low"
			},
			validation_errors: validationErrors
		};
	} catch (err) {
		// Any error: return empty extraction (OCR is best-effort)
		console.warn("Ticket OCR error:", err);
		return emptyExtraction();
	}
}
