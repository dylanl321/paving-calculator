// Shared utilities and types for PDF generation
import type { jsPDF as JsPDFInstance } from 'jspdf';
import type { JobState } from '$lib/stores/job.svelte';
import { formatFeet } from '$lib/utils/format';
import { spreadSpecCheck } from '$lib/config';

export async function getJsPDF() {
	const module = await import('jspdf');
	return module.jsPDF;
}

export function addSection(
	doc: JsPDFInstance,
	title: string,
	yPos: number,
	pageWidth: number,
	margin: number
): void {
	doc.setFontSize(12);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(0);
	doc.text(title, margin, yPos);

	// Underline
	doc.setDrawColor(200);
	doc.setLineWidth(1);
	doc.line(margin, yPos + 3, pageWidth - margin, yPos + 3);
}

export function getMachineLabel(machineId: string): string {
	const machines: Record<string, string> = {
		none: 'None',
		'mtv-500': 'MTV 500 tons',
		'mtv-300': 'MTV 300 tons',
		screed: 'Screed 0.5 tons'
	};
	return machines[machineId] || machineId;
}

export function getTackLabel(tackId: string): string {
	const labels: Record<string, string> = {
		'new-to-new': 'New AC to New AC',
		'new-low-rap': 'New AC (≤25% RAP) to Aged',
		'new-high-rap': 'New AC (>25% RAP) to Aged'
	};
	return labels[tackId] || tackId;
}

export async function loadImageAsDataUrl(url: string): Promise<string | null> {
	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		const blob = await response.blob();
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

// Single-calculator proof data
export interface CalcProofData {
	title: string;
	inputs: Record<string, string | number>;
	steps: Array<{
		step: number;
		label: string;
		formula: string;
		result: string;
	}>;
	result: {
		value: string;
		unit: string;
	};
	notes?: string;
	jobContext?: {
		width?: number;
		thickness?: number;
		rate?: number;
		wastePct?: number;
		tackApplication?: string;
	};
}

export interface DailyReportEntry {
	entry_type: string;
	timestamp: string;
	station_start: number | null;
	station_end: number | null;
	distance_ft: number | null;
	tons_placed: number | null;
	loads_count: number | null;
	truck_tickets: string[] | null;
	spread_rate_actual: number | null;
	tack_gallons: number | null;
	lane: string | null;
	notes: string | null;
}

export interface LoadRecord {
	id: string;
	ticket_number: string | null;
	tons: number;
	timestamp: number;
	spread_rate: number | null;
	notes: string | null;
}

export interface DailyReportData {
	date: string; // YYYY-MM-DD
	siteName: string;
	orgName?: string;
	/** GDOT header block fields — leave null/undefined to render blank */
	gdotProjectNumber?: string | null;
	gdotCounty?: string | null;
	gdotRoute?: string | null;
	gdotContractor?: string | null;
	weatherTempF: number | null;
	weatherConditions: string | null;
	windSpeedMph: number | null;
	crewCount: number | null;
	startTime: string | null;
	endTime: string | null;
	notes: string | null;
	entries: DailyReportEntry[];
	loads?: LoadRecord[];
	totals: {
		totalTons: number;
		totalDistanceFt: number;
		totalLoads: number;
		totalTackGallons: number;
		hoursWorked: number;
	};
	yield: {
		actualRate: number | null;
		targetRate: number | null;
		diffPct: number | null;
	};
	compliance?: {
		targetSpreadRate: number | null;
		courseType: string | null;
		totalPavingEntries: number;
		goodCount: number;
		warnCount: number;
		badCount: number;
		pctInSpec: number;
		toleranceLbsSy: number;
	} | null;
}

export interface WeeklyMonthlyReportData {
	periodType: 'week' | 'month';
	period: string;
	bounds: { start: string; end: string };
	days: Array<{
		date: string;
		tons: number;
		loads: number;
		distance_ft: number;
		hours: number;
	}>;
	totals: {
		tons: number;
		loads: number;
		distance_ft: number;
		days_worked: number;
		avg_tons_per_day: number;
	};
}

/**
 * Render the GDOT Construction Manual-style header block onto a jsPDF document.
 * Returns the new yPos after the block.
 */
export function addGdotHeaderBlock(
	doc: JsPDFInstance,
	yPos: number,
	pageWidth: number,
	margin: number,
	fields: {
		projectNumber?: string | null;
		county?: string | null;
		route?: string | null;
		contractor?: string | null;
		weather?: string | null;
		date?: string | null;
	}
): number {
	const blockPadding = 8;
	const rowHeight = 16;
	const numRows = 3;
	const blockHeight = blockPadding * 2 + numRows * rowHeight;
	const blockWidth = pageWidth - margin * 2;
	const colMid = margin + blockWidth / 2;

	// Outer border
	doc.setDrawColor(0);
	doc.setLineWidth(0.5);
	doc.rect(margin, yPos, blockWidth, blockHeight);

	// Vertical divider
	doc.line(colMid, yPos, colMid, yPos + blockHeight);

	// Horizontal row dividers
	for (let i = 1; i < numRows; i++) {
		const lineY = yPos + blockPadding + i * rowHeight;
		doc.line(margin, lineY, margin + blockWidth, lineY);
	}

	doc.setFontSize(8.5);

	const rows = [
		['Project Number', fields.projectNumber ?? '', 'County', fields.county ?? ''],
		['Route', fields.route ?? '', 'Contractor', fields.contractor ?? ''],
		['Weather', fields.weather ?? '', 'Date', fields.date ?? '']
	];

	rows.forEach((row, i) => {
		const textY = yPos + blockPadding + i * rowHeight + 10;
		const leftLabel = row[0];
		const leftVal = row[1];
		const rightLabel = row[2];
		const rightVal = row[3];

		// Left cell
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(0);
		doc.text(leftLabel + ': ', margin + 4, textY);
		const leftLabelWidth = doc.getTextWidth(leftLabel + ': ');
		doc.setFont('helvetica', 'normal');
		if (leftVal) {
			doc.text(leftVal, margin + 4 + leftLabelWidth, textY);
		}

		// Right cell
		doc.setFont('helvetica', 'bold');
		doc.text(rightLabel + ': ', colMid + 4, textY);
		const rightLabelWidth = doc.getTextWidth(rightLabel + ': ');
		doc.setFont('helvetica', 'normal');
		if (rightVal) {
			doc.text(rightVal, colMid + 4 + rightLabelWidth, textY);
		}
	});

	return yPos + blockHeight + 8;
}

// Re-export for convenience
export { formatFeet, spreadSpecCheck };
export type { JobState };
