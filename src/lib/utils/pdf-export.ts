// PDF proof sheet generator for PaveRate calculations.
// Captures job setup parameters and provides templates for calculator sections.
import type { jsPDF as JsPDFInstance } from 'jspdf';
import type { JobState } from '$lib/stores/job.svelte';
import { formatFeet } from '$lib/utils/format';
import { spreadSpecCheck } from '$lib/config';

async function getJsPDF() {
	const module = await import('jspdf');
	return module.jsPDF;
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

export async function generateProofPDF(jobState: JobState): Promise<void> {
	const jsPDF = await getJsPDF();
	const doc = new jsPDF({
		orientation: 'portrait',
		unit: 'pt',
		format: 'letter'
	});

	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const margin = 40;
	const contentWidth = pageWidth - margin * 2;
	let yPos = margin;

	const timestamp = new Date().toLocaleString('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	// Header
	doc.setFontSize(20);
	doc.setFont('helvetica', 'bold');
	doc.text('PaveRate — Field Calculation Proof', margin, yPos);
	yPos += 30;

	// Timestamp
	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');
	doc.setTextColor(100);
	doc.text(`Generated: ${timestamp}`, margin, yPos);
	yPos += 25;

	// Job Setup Section
	doc.setFontSize(14);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(0);
	doc.text('Job Setup Parameters', margin, yPos);
	yPos += 5;

	// Underline
	doc.setDrawColor(242, 192, 55);
	doc.setLineWidth(2);
	doc.line(margin, yPos, margin + 150, yPos);
	yPos += 15;

	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');

	const machineLabel = getMachineLabel(jobState.machineId);
	const spreadRate = Math.round(jobState.thicknessIn * 110);

	const jobParams = [
		{ label: 'Mat Width', value: `${jobState.widthFt} ft` },
		{ label: 'Target Thickness', value: `${jobState.thicknessIn}"` },
		{ label: 'Target Spread Rate', value: `${spreadRate} lbs/SY` },
		{ label: 'Truck Load', value: `${jobState.truckLoadTons} tons` },
		{ label: 'Machine Type', value: machineLabel },
		{ label: 'First Pass Deduction', value: jobState.firstPass ? 'Yes' : 'No' },
		{ label: 'Waste Allowance', value: `${jobState.wastePct}%` }
	];

	jobParams.forEach((param) => {
		doc.setFont('helvetica', 'bold');
		doc.text(`${param.label}:`, margin, yPos);
		doc.setFont('helvetica', 'normal');
		doc.text(param.value, margin + 150, yPos);
		yPos += 16;
	});

	yPos += 15;

	// Calculator Sections
	addSection(doc, 'Spread Rate Calculator', yPos, pageWidth, margin);
	yPos += 25;
	doc.setFontSize(9);
	doc.setFont('helvetica', 'normal');
	doc.text(`Target rate from job thickness: ${spreadRate} lbs/SY`, margin + 10, yPos);
	yPos += 14;
	doc.text('Formula: rate = thickness × 110', margin + 10, yPos);
	yPos += 14;
	doc.setFont('helvetica', 'italic');
	doc.setTextColor(100);
	doc.text('(Fill in actual placed tons and distance to verify rate)', margin + 10, yPos);
	yPos += 25;
	doc.setTextColor(0);

	if (yPos > pageHeight - 200) {
		doc.addPage();
		yPos = margin;
	}

	addSection(doc, 'Feet Left Today', yPos, pageWidth, margin);
	yPos += 25;
	doc.setFontSize(9);
	doc.setFont('helvetica', 'normal');
	doc.text(`Current truck load size: ${jobState.truckLoadTons} tons`, margin + 10, yPos);
	yPos += 14;
	doc.text('Formula: feet = tons × 2000 × 9 ÷ (width × rate)', margin + 10, yPos);
	yPos += 14;
	doc.setFont('helvetica', 'italic');
	doc.setTextColor(100);
	doc.text('(Calculate remaining distance based on loads or tons left)', margin + 10, yPos);
	yPos += 25;
	doc.setTextColor(0);

	if (yPos > pageHeight - 200) {
		doc.addPage();
		yPos = margin;
	}

	addSection(doc, 'Tonnage to Order', yPos, pageWidth, margin);
	yPos += 25;
	doc.setFontSize(9);
	doc.setFont('helvetica', 'normal');
	doc.text(
		`Waste allowance: ${jobState.wastePct}% | Width: ${jobState.widthFt} ft | Rate: ${spreadRate} lbs/SY`,
		margin + 10,
		yPos
	);
	yPos += 14;
	doc.text('Formula: tons = (length × width ÷ 9 × rate) ÷ 2000 × (1 + waste%)', margin + 10, yPos);
	yPos += 14;
	doc.setFont('helvetica', 'italic');
	doc.setTextColor(100);
	doc.text('(Enter job length to calculate tonnage needed)', margin + 10, yPos);
	yPos += 25;
	doc.setTextColor(0);

	if (yPos > pageHeight - 200) {
		doc.addPage();
		yPos = margin;
	}

	addSection(doc, 'Tack Rate', yPos, pageWidth, margin);
	yPos += 25;
	doc.setFontSize(9);
	doc.setFont('helvetica', 'normal');
	doc.text(`Application: ${getTackLabel(jobState.tackApplication)}`, margin + 10, yPos);
	yPos += 14;
	doc.text('Formula: gallons = (length × width ÷ 9) × shot rate (gal/SY)', margin + 10, yPos);
	yPos += 14;
	doc.text('Rate ranges per GDOT Table 2:', margin + 10, yPos);
	yPos += 12;
	doc.setFontSize(8);
	doc.text('• New to New: 0.05–0.08 gal/yd²', margin + 20, yPos);
	yPos += 11;
	doc.text('• New (≤25% RAP) to Aged/Milled: 0.06–0.10 gal/yd²', margin + 20, yPos);
	yPos += 11;
	doc.text('• New (>25% RAP) to Aged/Milled: 0.08–0.12 gal/yd²', margin + 20, yPos);
	yPos += 20;
	doc.setTextColor(0);

	if (yPos > pageHeight - 200) {
		doc.addPage();
		yPos = margin;
	}

	addSection(doc, 'Stick Check', yPos, pageWidth, margin);
	yPos += 25;
	doc.setFontSize(9);
	doc.setFont('helvetica', 'normal');
	doc.text('Formula: loose = compacted × 1.25', margin + 10, yPos);
	yPos += 14;
	doc.text(
		`Example: ${jobState.thicknessIn}" compacted = ${(jobState.thicknessIn * 1.25).toFixed(2)}" loose behind screed`,
		margin + 10,
		yPos
	);
	yPos += 25;

	// Footer on all pages
	const totalPages = doc.getNumberOfPages();
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i);
		const footerY = pageHeight - 30;
		doc.setFontSize(8);
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(150);
		doc.text('Generated by PaveRate (paverate.com)', margin, footerY);
		doc.text('Values based on GDOT specifications', pageWidth - margin, footerY, {
			align: 'right'
		});
	}

	// Save
	const filename = `paverate-proof-${new Date().toISOString().split('T')[0]}.pdf`;
	doc.save(filename);
}

function addSection(
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

function getMachineLabel(machineId: string): string {
	const machines: Record<string, string> = {
		none: 'None',
		'mtv-500': 'MTV 500 tons',
		'mtv-300': 'MTV 300 tons',
		screed: 'Screed 0.5 tons'
	};
	return machines[machineId] || machineId;
}

function getTackLabel(tackId: string): string {
	const labels: Record<string, string> = {
		'new-to-new': 'New AC to New AC',
		'new-low-rap': 'New AC (≤25% RAP) to Aged',
		'new-high-rap': 'New AC (>25% RAP) to Aged'
	};
	return labels[tackId] || tackId;
}

// ---- QCRR-style daily report ----

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

async function loadImageAsDataUrl(url: string): Promise<string | null> {
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

export async function generateDailyReportPDF(
	jobState: JobState,
	day: DailyReportData,
	signatureDataUrl?: string
): Promise<void> {
	const jsPDF = await getJsPDF();
	const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const margin = 40;
	let yPos = margin;

	const dateLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});

	// Load logo
	let logoDataUrl: string | null = null;
	try {
		const logoResponse = await fetch('/logo-wordmark.png');
		if (logoResponse.ok) {
			const logoBuffer = await logoResponse.arrayBuffer();
			const logoBase64 = btoa(
				new Uint8Array(logoBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
			);
			logoDataUrl = `data:image/png;base64,${logoBase64}`;
		}
	} catch {
		// Logo loading failed, continue without it
	}

	// Dark header banner
	const bannerHeight = 55;
	doc.setFillColor(26, 26, 26);
	doc.rect(margin - 5, yPos - 12, pageWidth - margin * 2 + 10, bannerHeight, 'F');

	// Add logo if loaded (top right of banner)
	if (logoDataUrl) {
		try {
			const logoWidth = 80;
			const logoHeight = 24;
			doc.addImage(
				logoDataUrl,
				'PNG',
				pageWidth - margin - logoWidth,
				yPos - 6,
				logoWidth,
				logoHeight
			);
		} catch {
			// Image add failed, continue without logo
		}
	}

	// Title in banner
	doc.setFontSize(18);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(255, 255, 255);
	doc.text('Daily Production Report', margin, yPos + 8);

	doc.setFontSize(11);
	doc.setFont('helvetica', 'normal');
	doc.text(dateLabel, margin, yPos + 26);

	yPos += bannerHeight + 8;

	// Site name and org name below banner
	doc.setTextColor(60);
	doc.setFontSize(10);
	if (day.siteName) {
		doc.text(day.siteName, margin, yPos);
	}
	if (day.orgName) {
		doc.text(day.orgName, pageWidth - margin, yPos, { align: 'right' });
	}
	yPos += 20;

	// Yellow accent line
	doc.setDrawColor(242, 192, 55);
	doc.setLineWidth(2);
	doc.line(margin, yPos, pageWidth - margin, yPos);
	yPos += 20;

	// Day conditions
	doc.setTextColor(0);
	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('Day Conditions', margin, yPos);
	yPos += 16;

	doc.setFontSize(10);
	const conditions = [
		`Temp: ${day.weatherTempF != null ? `${day.weatherTempF}°F` : '—'}`,
		`Conditions: ${day.weatherConditions ?? '—'}`,
		`Wind: ${day.windSpeedMph != null ? `${day.windSpeedMph} mph` : '—'}`,
		`Crew: ${day.crewCount != null ? day.crewCount : '—'}`,
		`Hours: ${day.startTime ?? '—'}–${day.endTime ?? '—'}`
	];
	doc.setFont('helvetica', 'normal');
	doc.text(conditions.join('     '), margin, yPos);
	yPos += 22;

	// Day totals
	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('Day Totals', margin, yPos);
	yPos += 16;

	const t = day.totals;
	const totalsLine = [
		`Tons placed: ${t.totalTons.toLocaleString(undefined, { maximumFractionDigits: 1 })}`,
		`Paved: ${formatFeet(t.totalDistanceFt)}`,
		`Loads: ${t.totalLoads}`,
		`Tack: ${Math.round(t.totalTackGallons)} gal`
	];
	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');
	doc.text(totalsLine.join('     '), margin, yPos);
	yPos += 18;

	// Yield vs target
	if (day.yield.actualRate != null && day.yield.targetRate != null) {
		const diff =
			day.yield.diffPct != null
				? `${day.yield.diffPct > 0 ? '+' : ''}${day.yield.diffPct.toFixed(1)}%`
				: '—';
		doc.setFont('helvetica', 'bold');
		doc.text(
			`Yield vs Target: ${Math.round(day.yield.actualRate)} lbs/SY actual vs ${Math.round(
				day.yield.targetRate
			)} lbs/SY target (${diff})`,
			margin,
			yPos
		);
		yPos += 18;
	}
	yPos += 6;

	// DOT Compliance Summary
	if (day.compliance && day.compliance.totalPavingEntries > 0) {
		doc.setFontSize(13);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(0);
		doc.text('DOT Compliance Summary', margin, yPos);
		yPos += 6;
		doc.setDrawColor(200);
		doc.setLineWidth(1);
		doc.line(margin, yPos, pageWidth - margin, yPos);
		yPos += 18;

		doc.setFontSize(10);
		doc.setFont('helvetica', 'normal');

		// Compliance bar
		const barHeight = 8;
		const barWidth = pageWidth - margin * 2;
		const barY = yPos;

		// Background
		doc.setFillColor(240, 240, 240);
		doc.rect(margin, barY, barWidth, barHeight, 'F');

		// Segments
		const total = day.compliance.totalPavingEntries;
		let xOffset = margin;

		if (day.compliance.goodCount > 0) {
			const width = (day.compliance.goodCount / total) * barWidth;
			doc.setFillColor(63, 178, 127); // #3fb27f
			doc.rect(xOffset, barY, width, barHeight, 'F');
			xOffset += width;
		}

		if (day.compliance.warnCount > 0) {
			const width = (day.compliance.warnCount / total) * barWidth;
			doc.setFillColor(224, 146, 47); // #e0922f
			doc.rect(xOffset, barY, width, barHeight, 'F');
			xOffset += width;
		}

		if (day.compliance.badCount > 0) {
			const width = (day.compliance.badCount / total) * barWidth;
			doc.setFillColor(216, 88, 79); // #d8584f
			doc.rect(xOffset, barY, width, barHeight, 'F');
		}

		yPos += barHeight + 12;

		// Summary text
		doc.setFont('helvetica', 'bold');
		doc.text(
			`${day.compliance.goodCount} of ${total} loads in spec (${day.compliance.pctInSpec.toFixed(0)}%)`,
			margin,
			yPos
		);
		yPos += 14;

		// Tolerance info
		doc.setFont('helvetica', 'normal');
		doc.setTextColor(100);
		const courseLabel = day.compliance.courseType || 'Unknown';
		doc.text(
			`GDOT Table 12 tolerance: ±${day.compliance.toleranceLbsSy} lbs/SY (${courseLabel})`,
			margin,
			yPos
		);
		yPos += 14;

		// Breakdown
		doc.text(
			`In spec: ${day.compliance.goodCount} | Marginal: ${day.compliance.warnCount} | Out: ${day.compliance.badCount}`,
			margin,
			yPos
		);
		yPos += 20;
		doc.setTextColor(0);
	}

	// Entry table
	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('Timeline', margin, yPos);
	yPos += 6;
	doc.setDrawColor(200);
	doc.setLineWidth(1);
	doc.line(margin, yPos + 3, pageWidth - margin, yPos + 3);
	yPos += 18;

	// Column layout
	const cols = [
		{ label: 'Time', x: margin },
		{ label: 'Type', x: margin + 50 },
		{ label: 'Station', x: margin + 110 },
		{ label: 'Tons', x: margin + 200 },
		{ label: 'Dist', x: margin + 245 },
		{ label: 'lbs/SY', x: margin + 305 },
		{ label: 'Detail', x: margin + 360 }
	];

	doc.setFontSize(8);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(100);
	cols.forEach((c) => doc.text(c.label, c.x, yPos));
	yPos += 12;
	doc.setTextColor(0);
	doc.setFont('helvetica', 'normal');

	if (day.entries.length === 0) {
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(120);
		doc.text('No entries logged for this day.', margin, yPos);
		yPos += 16;
		doc.setTextColor(0);
	}

	for (const e of day.entries) {
		if (yPos > pageHeight - 80) {
			doc.addPage();
			yPos = margin;
		}
		const station =
			e.station_start != null && e.station_end != null
				? `${e.station_start}+00→${e.station_end}+00`
				: '—';
		const detailParts: string[] = [];
		if (e.lane) detailParts.push(e.lane);
		if (e.loads_count != null) detailParts.push(`${e.loads_count} loads`);
		if (e.tack_gallons != null) detailParts.push(`${Math.round(e.tack_gallons)} gal`);
		if (e.truck_tickets?.length) detailParts.push(`#${e.truck_tickets.join(', #')}`);
		if (e.notes) detailParts.push(e.notes);
		const detail = detailParts.join('; ');

		doc.setFontSize(8);
		doc.text(e.timestamp, cols[0].x, yPos);
		doc.text(e.entry_type, cols[1].x, yPos);
		doc.text(station, cols[2].x, yPos);
		doc.text(e.tons_placed != null ? String(e.tons_placed) : '—', cols[3].x, yPos);
		doc.text(e.distance_ft != null ? formatFeet(e.distance_ft) : '—', cols[4].x, yPos);

		// Spread rate with compliance indicator
		const rateStr = e.spread_rate_actual != null ? String(Math.round(e.spread_rate_actual)) : '—';
		doc.text(rateStr, cols[5].x, yPos);

		// Add colored compliance square for paving entries with spread rate
		if (e.entry_type === 'paving' && e.spread_rate_actual != null && day.compliance?.targetSpreadRate) {
			const check = spreadSpecCheck(
				e.spread_rate_actual,
				day.compliance.targetSpreadRate,
				day.compliance.courseType,
				null
			);
			if (check) {
				const squareSize = 4;
				const squareX = cols[5].x + doc.getTextWidth(rateStr) + 2;
				const squareY = yPos - 3;

				if (check.status === 'good') {
					doc.setFillColor(63, 178, 127); // #3fb27f
				} else if (check.status === 'warn') {
					doc.setFillColor(224, 146, 47); // #e0922f
				} else {
					doc.setFillColor(216, 88, 79); // #d8584f
				}
				doc.rect(squareX, squareY, squareSize, squareSize, 'F');
			}
		}

		const detailLines = doc.splitTextToSize(detail || '—', pageWidth - margin - cols[6].x);
		doc.text(detailLines, cols[6].x, yPos);
		yPos += Math.max(14, detailLines.length * 10);
	}

	// Per-Load Tickets section
	if (day.loads && day.loads.length > 0) {
		yPos += 10;
		if (yPos > pageHeight - 120) {
			doc.addPage();
			yPos = margin;
		}
		doc.setFontSize(13);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(0);
		doc.text('Load Tickets', margin, yPos);
		yPos += 6;
		doc.setDrawColor(242, 192, 55);
		doc.setLineWidth(2);
		doc.line(margin, yPos, margin + 150, yPos);
		yPos += 18;

		// Column headers
		const loadCols = [
			{ label: 'Time', x: margin },
			{ label: 'Ticket #', x: margin + 60 },
			{ label: 'Tons', x: margin + 140 },
			{ label: 'Spread Rate', x: margin + 185 },
			{ label: 'Notes', x: margin + 250 }
		];
		doc.setFontSize(8);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(100);
		loadCols.forEach((c) => doc.text(c.label, c.x, yPos));
		yPos += 12;
		doc.setTextColor(0);
		doc.setFont('helvetica', 'normal');

		const sortedLoads = [...day.loads].sort((a, b) => a.timestamp - b.timestamp);
		let totalTons = 0;

		for (const load of sortedLoads) {
			if (yPos > pageHeight - 80) {
				doc.addPage();
				yPos = margin;
			}
			const timeStr = new Date(load.timestamp * 1000).toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit',
				hour12: true
			});
			const ticketStr = load.ticket_number || '—';
			const tonsStr = load.tons.toFixed(1);
			const rateStr = load.spread_rate != null ? `${Math.round(load.spread_rate)} lbs/SY` : '—';
			const notesStr = load.notes || '—';

			doc.setFontSize(8);
			doc.text(timeStr, loadCols[0].x, yPos);
			doc.text(ticketStr, loadCols[1].x, yPos);
			doc.text(tonsStr, loadCols[2].x, yPos);
			doc.text(rateStr, loadCols[3].x, yPos);
			const notesLines = doc.splitTextToSize(notesStr, pageWidth - margin - loadCols[4].x);
			doc.text(notesLines, loadCols[4].x, yPos);
			yPos += Math.max(12, notesLines.length * 10);
			totalTons += load.tons;
		}

		yPos += 4;
		const avgTonsPerLoad = totalTons / sortedLoads.length;
		const summaryStr = `${sortedLoads.length} loads | ${totalTons.toFixed(1)} total tons | avg ${avgTonsPerLoad.toFixed(1)} T/load`;
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(9);
		doc.text(summaryStr, margin, yPos);
		yPos += 14;
	}

	if (day.notes) {
		yPos += 10;
		if (yPos > pageHeight - 80) {
			doc.addPage();
			yPos = margin;
		}
		doc.setFontSize(13);
		doc.setFont('helvetica', 'bold');
		doc.text('Notes', margin, yPos);
		yPos += 16;
		doc.setFontSize(10);
		doc.setFont('helvetica', 'normal');
		const noteLines = doc.splitTextToSize(day.notes, pageWidth - margin * 2);
		doc.text(noteLines, margin, yPos);
	}

	// Supervisor Signature section
	if (signatureDataUrl) {
		yPos += 20;
		if (yPos > pageHeight - 150) {
			doc.addPage();
			yPos = margin;
		}

		doc.setFontSize(13);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(0);
		doc.text('Supervisor Signature', margin, yPos);
		yPos += 6;

		// Horizontal line
		doc.setDrawColor(200);
		doc.setLineWidth(1);
		doc.line(margin, yPos, pageWidth - margin, yPos);
		yPos += 20;

		// Add signature image
		try {
			const imgWidth = 200;
			const imgHeight = 80;
			doc.addImage(signatureDataUrl, 'PNG', margin, yPos, imgWidth, imgHeight);
			yPos += imgHeight + 10;
		} catch (err) {
			console.error('Failed to add signature to PDF:', err);
		}
	}

	// Job parameters reference footer line
	const totalPages = doc.getNumberOfPages();
	const machineLabel = getMachineLabel(jobState.machineId);
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i);
		const footerY = pageHeight - 30;
		doc.setFontSize(8);
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(150);
		doc.text(
			`Job: ${jobState.widthFt} ft × ${jobState.thicknessIn}" · ${machineLabel} · PaveRate (paverate.com)`,
			margin,
			footerY
		);
		doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
	}

	const filename = `paverate-daily-${day.date}.pdf`;
	doc.save(filename);
}

/**
 * Generate daily report PDF and return as Blob (for sharing via email)
 */
export async function generateDailyReportPDFBlob(
	jobState: JobState,
	day: DailyReportData,
	signatureDataUrl?: string
): Promise<Blob> {
	const jsPDF = await getJsPDF();
	const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const margin = 40;
	let yPos = margin;

	const dateLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});

	// Load logo
	let logoDataUrl: string | null = null;
	try {
		const logoResponse = await fetch('/logo-wordmark.png');
		if (logoResponse.ok) {
			const logoBuffer = await logoResponse.arrayBuffer();
			const logoBase64 = btoa(
				new Uint8Array(logoBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
			);
			logoDataUrl = `data:image/png;base64,${logoBase64}`;
		}
	} catch {
		// Logo loading failed, continue without it
	}

	// Dark header banner
	const bannerHeight = 55;
	doc.setFillColor(26, 26, 26);
	doc.rect(margin - 5, yPos - 12, pageWidth - margin * 2 + 10, bannerHeight, 'F');

	// Add logo if loaded (top right of banner)
	if (logoDataUrl) {
		try {
			const logoWidth = 80;
			const logoHeight = 24;
			doc.addImage(
				logoDataUrl,
				'PNG',
				pageWidth - margin - logoWidth,
				yPos - 6,
				logoWidth,
				logoHeight
			);
		} catch {
			// Image add failed, continue without logo
		}
	}

	// Title in banner
	doc.setFontSize(18);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(255, 255, 255);
	doc.text('Daily Production Report', margin, yPos + 8);

	doc.setFontSize(11);
	doc.setFont('helvetica', 'normal');
	doc.text(dateLabel, margin, yPos + 26);

	yPos += bannerHeight + 8;

	// Site name and org name below banner
	doc.setTextColor(60);
	doc.setFontSize(10);
	if (day.siteName) {
		doc.text(day.siteName, margin, yPos);
	}
	if (day.orgName) {
		doc.text(day.orgName, pageWidth - margin, yPos, { align: 'right' });
	}
	yPos += 20;

	// Yellow accent line
	doc.setDrawColor(242, 192, 55);
	doc.setLineWidth(2);
	doc.line(margin, yPos, pageWidth - margin, yPos);
	yPos += 20;

	// Day conditions
	doc.setTextColor(0);
	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('Day Conditions', margin, yPos);
	yPos += 16;

	doc.setFontSize(10);
	const conditions = [
		`Temp: ${day.weatherTempF != null ? `${day.weatherTempF}°F` : '—'}`,
		`Conditions: ${day.weatherConditions ?? '—'}`,
		`Wind: ${day.windSpeedMph != null ? `${day.windSpeedMph} mph` : '—'}`,
		`Crew: ${day.crewCount != null ? day.crewCount : '—'}`,
		`Hours: ${day.startTime ?? '—'}–${day.endTime ?? '—'}`
	];
	doc.setFont('helvetica', 'normal');
	doc.text(conditions.join('     '), margin, yPos);
	yPos += 22;

	// Day totals
	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('Day Totals', margin, yPos);
	yPos += 16;

	const t = day.totals;
	const totalsLine = [
		`Tons placed: ${t.totalTons.toLocaleString(undefined, { maximumFractionDigits: 1 })}`,
		`Paved: ${formatFeet(t.totalDistanceFt)}`,
		`Loads: ${t.totalLoads}`,
		`Tack: ${Math.round(t.totalTackGallons)} gal`
	];
	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');
	doc.text(totalsLine.join('     '), margin, yPos);
	yPos += 18;

	// Yield vs target
	if (day.yield.actualRate != null && day.yield.targetRate != null) {
		const diff =
			day.yield.diffPct != null
				? `${day.yield.diffPct > 0 ? '+' : ''}${day.yield.diffPct.toFixed(1)}%`
				: '—';
		doc.setFont('helvetica', 'bold');
		doc.text(
			`Yield vs Target: ${Math.round(day.yield.actualRate)} lbs/SY actual vs ${Math.round(
				day.yield.targetRate
			)} lbs/SY target (${diff})`,
			margin,
			yPos
		);
		yPos += 18;
	}
	yPos += 6;

	// DOT Compliance Summary (if present)
	if (day.compliance && day.compliance.totalPavingEntries > 0) {
		doc.setFontSize(13);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(0);
		doc.text('DOT Compliance Summary', margin, yPos);
		yPos += 6;
		doc.setDrawColor(200);
		doc.setLineWidth(1);
		doc.line(margin, yPos, pageWidth - margin, yPos);
		yPos += 18;

		doc.setFontSize(10);
		doc.setFont('helvetica', 'normal');

		// Compliance bar
		const barHeight = 8;
		const barWidth = pageWidth - margin * 2;
		const barY = yPos;

		// Background
		doc.setFillColor(240, 240, 240);
		doc.rect(margin, barY, barWidth, barHeight, 'F');

		// Segments
		const total = day.compliance.totalPavingEntries;
		let xOffset = margin;

		if (day.compliance.goodCount > 0) {
			const width = (day.compliance.goodCount / total) * barWidth;
			doc.setFillColor(63, 178, 127);
			doc.rect(xOffset, barY, width, barHeight, 'F');
			xOffset += width;
		}

		if (day.compliance.warnCount > 0) {
			const width = (day.compliance.warnCount / total) * barWidth;
			doc.setFillColor(224, 146, 47);
			doc.rect(xOffset, barY, width, barHeight, 'F');
			xOffset += width;
		}

		if (day.compliance.badCount > 0) {
			const width = (day.compliance.badCount / total) * barWidth;
			doc.setFillColor(216, 88, 79);
			doc.rect(xOffset, barY, width, barHeight, 'F');
		}

		yPos += barHeight + 12;

		// Summary text
		doc.setFont('helvetica', 'bold');
		doc.text(
			`${day.compliance.goodCount} of ${total} loads in spec (${day.compliance.pctInSpec.toFixed(0)}%)`,
			margin,
			yPos
		);
		yPos += 14;

		// Tolerance info
		doc.setFont('helvetica', 'normal');
		doc.setTextColor(100);
		const courseLabel = day.compliance.courseType || 'Unknown';
		doc.text(
			`GDOT Table 12 tolerance: ±${day.compliance.toleranceLbsSy} lbs/SY (${courseLabel})`,
			margin,
			yPos
		);
		yPos += 14;

		// Breakdown
		doc.text(
			`In spec: ${day.compliance.goodCount} | Marginal: ${day.compliance.warnCount} | Out: ${day.compliance.badCount}`,
			margin,
			yPos
		);
		yPos += 20;
		doc.setTextColor(0);
	}

	// Entry table (simplified for email)
	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('Timeline', margin, yPos);
	yPos += 6;
	doc.setDrawColor(200);
	doc.setLineWidth(1);
	doc.line(margin, yPos + 3, pageWidth - margin, yPos + 3);
	yPos += 18;

	// Column layout
	const cols = [
		{ label: 'Time', x: margin },
		{ label: 'Type', x: margin + 50 },
		{ label: 'Station', x: margin + 110 },
		{ label: 'Tons', x: margin + 200 },
		{ label: 'Dist', x: margin + 245 },
		{ label: 'lbs/SY', x: margin + 305 },
		{ label: 'Detail', x: margin + 360 }
	];

	doc.setFontSize(8);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(100);
	cols.forEach((c) => doc.text(c.label, c.x, yPos));
	yPos += 12;
	doc.setTextColor(0);
	doc.setFont('helvetica', 'normal');

	if (day.entries.length === 0) {
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(120);
		doc.text('No entries logged for this day.', margin, yPos);
		yPos += 16;
		doc.setTextColor(0);
	}

	for (const e of day.entries) {
		if (yPos > pageHeight - 80) {
			doc.addPage();
			yPos = margin;
		}
		const station =
			e.station_start != null && e.station_end != null
				? `${e.station_start}+00→${e.station_end}+00`
				: '—';
		const detailParts: string[] = [];
		if (e.lane) detailParts.push(e.lane);
		if (e.loads_count != null) detailParts.push(`${e.loads_count} loads`);
		if (e.tack_gallons != null) detailParts.push(`${Math.round(e.tack_gallons)} gal`);
		if (e.truck_tickets?.length) detailParts.push(`#${e.truck_tickets.join(', #')}`);
		if (e.notes) detailParts.push(e.notes);
		const detail = detailParts.join('; ');

		doc.setFontSize(8);
		doc.text(e.timestamp, cols[0].x, yPos);
		doc.text(e.entry_type, cols[1].x, yPos);
		doc.text(station, cols[2].x, yPos);
		doc.text(e.tons_placed != null ? String(e.tons_placed) : '—', cols[3].x, yPos);
		doc.text(e.distance_ft != null ? formatFeet(e.distance_ft) : '—', cols[4].x, yPos);

		// Spread rate with compliance indicator
		const rateStr = e.spread_rate_actual != null ? String(Math.round(e.spread_rate_actual)) : '—';
		doc.text(rateStr, cols[5].x, yPos);

		// Add colored compliance square for paving entries with spread rate
		if (e.entry_type === 'paving' && e.spread_rate_actual != null && day.compliance?.targetSpreadRate) {
			const check = spreadSpecCheck(
				e.spread_rate_actual,
				day.compliance.targetSpreadRate,
				day.compliance.courseType,
				null
			);
			if (check) {
				const squareSize = 4;
				const squareX = cols[5].x + doc.getTextWidth(rateStr) + 2;
				const squareY = yPos - 3;

				if (check.status === 'good') {
					doc.setFillColor(63, 178, 127);
				} else if (check.status === 'warn') {
					doc.setFillColor(224, 146, 47);
				} else {
					doc.setFillColor(216, 88, 79);
				}
				doc.rect(squareX, squareY, squareSize, squareSize, 'F');
			}
		}

		const detailLines = doc.splitTextToSize(detail || '—', pageWidth - margin - cols[6].x);
		doc.text(detailLines, cols[6].x, yPos);
		yPos += Math.max(14, detailLines.length * 10);
	}

	// Supervisor Signature section
	if (signatureDataUrl) {
		yPos += 20;
		if (yPos > pageHeight - 150) {
			doc.addPage();
			yPos = margin;
		}

		doc.setFontSize(13);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(0);
		doc.text('Supervisor Signature', margin, yPos);
		yPos += 6;

		// Horizontal line
		doc.setDrawColor(200);
		doc.setLineWidth(1);
		doc.line(margin, yPos, pageWidth - margin, yPos);
		yPos += 20;

		// Add signature image
		try {
			const imgWidth = 200;
			const imgHeight = 80;
			doc.addImage(signatureDataUrl, 'PNG', margin, yPos, imgWidth, imgHeight);
			yPos += imgHeight + 10;
		} catch (err) {
			console.error('Failed to add signature to PDF:', err);
		}
	}

	// Job parameters reference footer line
	const totalPages = doc.getNumberOfPages();
	const machineLabel = getMachineLabel(jobState.machineId);
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i);
		const footerY = pageHeight - 30;
		doc.setFontSize(8);
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(150);
		doc.text(
			`Job: ${jobState.widthFt} ft × ${jobState.thicknessIn}" · ${machineLabel} · PaveRate (paverate.com)`,
			margin,
			footerY
		);
		doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
	}

	return doc.output('blob');
}

// ---- Single Calculation Proof PDF ----

export async function generateCalcProofPDF(data: CalcProofData): Promise<void> {
	const jsPDF = await getJsPDF();
	const doc = new jsPDF({
		orientation: 'portrait',
		unit: 'pt',
		format: 'letter'
	});

	const pageWidth = doc.internal.pageSize.getWidth();
	const margin = 40;
	let yPos = margin;

	const timestamp = new Date().toLocaleString('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	// Header
	doc.setFontSize(18);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(0);
	doc.text('PaveRate — Calculation Proof', margin, yPos);
	yPos += 25;

	// Timestamp
	doc.setFontSize(9);
	doc.setFont('helvetica', 'normal');
	doc.setTextColor(100);
	doc.text(`Generated: ${timestamp}`, margin, yPos);
	yPos += 25;

	// Calculation title
	doc.setFontSize(14);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(0);
	doc.text(`Calculation: ${data.title}`, margin, yPos);
	yPos += 5;

	// Yellow underline
	doc.setDrawColor(242, 192, 55);
	doc.setLineWidth(2);
	doc.line(margin, yPos, margin + 180, yPos);
	yPos += 20;

	// Job context (if provided)
	if (data.jobContext) {
		doc.setFontSize(11);
		doc.setFont('helvetica', 'bold');
		doc.text('Job Context', margin, yPos);
		yPos += 15;

		doc.setFontSize(9);
		doc.setFont('helvetica', 'normal');
		if (data.jobContext.width != null) {
			doc.text(`Mat Width: ${data.jobContext.width} ft`, margin + 10, yPos);
			yPos += 12;
		}
		if (data.jobContext.thickness != null) {
			doc.text(`Target Thickness: ${data.jobContext.thickness}"`, margin + 10, yPos);
			yPos += 12;
		}
		if (data.jobContext.rate != null) {
			doc.text(`Target Spread Rate: ${data.jobContext.rate} lbs/SY`, margin + 10, yPos);
			yPos += 12;
		}
		if (data.jobContext.wastePct != null) {
			doc.text(`Waste Allowance: ${data.jobContext.wastePct}%`, margin + 10, yPos);
			yPos += 12;
		}
		if (data.jobContext.tackApplication) {
			doc.text(`Tack Application: ${data.jobContext.tackApplication}`, margin + 10, yPos);
			yPos += 12;
		}
		yPos += 10;
	}

	// Input values
	doc.setFontSize(11);
	doc.setFont('helvetica', 'bold');
	doc.text('Input Values', margin, yPos);
	yPos += 15;

	doc.setFontSize(9);
	doc.setFont('helvetica', 'normal');
	Object.entries(data.inputs).forEach(([key, value]) => {
		doc.text(`${key}: ${value}`, margin + 10, yPos);
		yPos += 12;
	});
	yPos += 10;

	// Calculation steps
	doc.setFontSize(11);
	doc.setFont('helvetica', 'bold');
	doc.text('Calculation Steps', margin, yPos);
	yPos += 5;

	// Underline
	doc.setDrawColor(200);
	doc.setLineWidth(1);
	doc.line(margin, yPos, pageWidth - margin, yPos);
	yPos += 15;

	data.steps.forEach((step) => {
		doc.setFontSize(9);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(0);
		doc.text(`${step.step}. ${step.label}`, margin, yPos);
		yPos += 14;

		doc.setFont('helvetica', 'normal');
		doc.setTextColor(60);
		doc.text(`${step.formula} = ${step.result}`, margin + 20, yPos);
		yPos += 16;
	});

	yPos += 5;

	// Final result (highlighted)
	doc.setFillColor(242, 192, 55, 30);
	doc.roundedRect(margin - 5, yPos - 10, pageWidth - margin * 2 + 10, 35, 4, 4, 'F');

	doc.setFontSize(12);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(0);
	doc.text('Final Result:', margin, yPos);
	yPos += 18;

	doc.setFontSize(14);
	doc.setTextColor(242, 192, 55);
	doc.text(`${data.result.value} ${data.result.unit}`, margin, yPos);
	yPos += 25;

	// Notes (if provided)
	if (data.notes) {
		doc.setFontSize(9);
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(100);
		const noteLines = doc.splitTextToSize(data.notes, pageWidth - margin * 2);
		doc.text(noteLines, margin, yPos);
	}

	// Footer
	const footerY = doc.internal.pageSize.getHeight() - 30;
	doc.setFontSize(8);
	doc.setFont('helvetica', 'italic');
	doc.setTextColor(150);
	doc.text('Generated by PaveRate (paverate.com)', margin, footerY);
	doc.text('Values based on GDOT specifications', pageWidth - margin, footerY, { align: 'right' });

	// Save with filename based on calc name and date
	const calcSlug = data.title.toLowerCase().replace(/\s+/g, '-');
	const dateStr = new Date().toISOString().split('T')[0];
	const filename = `paverate-proof-${calcSlug}-${dateStr}.pdf`;
	doc.save(filename);
}

// ---- Weekly/Monthly rollup report ----

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

export async function generateWeeklyMonthlyPDF(
	data: WeeklyMonthlyReportData,
	siteName: string,
	orgName: string | undefined,
	jobState: JobState
): Promise<void> {
	const jsPDF = await getJsPDF();
	const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const margin = 40;
	let yPos = margin;

	// Load logo
	let logoDataUrl: string | null = null;
	try {
		const logoResponse = await fetch('/logo-wordmark.png');
		if (logoResponse.ok) {
			const logoBuffer = await logoResponse.arrayBuffer();
			const logoBase64 = btoa(
				new Uint8Array(logoBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
			);
			logoDataUrl = `data:image/png;base64,${logoBase64}`;
		}
	} catch {
		// Logo loading failed, continue without it
	}

	// Dark header banner
	const bannerHeight = 55;
	doc.setFillColor(26, 26, 26);
	doc.rect(margin - 5, yPos - 12, pageWidth - margin * 2 + 10, bannerHeight, 'F');

	// Add logo if loaded (top right of banner)
	if (logoDataUrl) {
		try {
			const logoWidth = 80;
			const logoHeight = 24;
			doc.addImage(
				logoDataUrl,
				'PNG',
				pageWidth - margin - logoWidth,
				yPos - 6,
				logoWidth,
				logoHeight
			);
		} catch {
			// Image add failed, continue without logo
		}
	}

	// Title in banner
	doc.setFontSize(18);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(255, 255, 255);
	const title = data.periodType === 'week' ? 'Weekly Production Report' : 'Monthly Production Report';
	doc.text(title, margin, yPos + 8);

	doc.setFontSize(11);
	doc.setFont('helvetica', 'normal');
	doc.text(data.period, margin, yPos + 26);

	yPos += bannerHeight + 8;

	// Site name and org name below banner
	doc.setTextColor(60);
	doc.setFontSize(10);
	if (siteName) {
		doc.text(siteName, margin, yPos);
	}
	if (orgName) {
		doc.text(orgName, pageWidth - margin, yPos, { align: 'right' });
	}
	yPos += 20;

	// Yellow accent line
	doc.setDrawColor(242, 192, 55);
	doc.setLineWidth(2);
	doc.line(margin, yPos, pageWidth - margin, yPos);
	yPos += 20;

	// Period range
	doc.setTextColor(0);
	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');
	const dateRange = `${new Date(data.bounds.start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(data.bounds.end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
	doc.text(dateRange, margin, yPos);
	yPos += 20;

	// Totals section
	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('Production Totals', margin, yPos);
	yPos += 16;

	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');

	const totals = [
		{ label: 'Total Tons', value: data.totals.tons.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
		{ label: 'Total Loads', value: String(data.totals.loads) },
		{ label: 'Total Distance', value: formatFeet(data.totals.distance_ft) },
		{ label: 'Days Worked', value: String(data.totals.days_worked) },
		{ label: 'Avg Tons/Day', value: data.totals.avg_tons_per_day.toFixed(1) }
	];

	// Totals in 2-column grid
	const colWidth = (pageWidth - margin * 2) / 2;
	let col = 0;
	let row = 0;

	totals.forEach((total) => {
		const x = margin + col * colWidth;
		const y = yPos + row * 20;

		doc.setFont('helvetica', 'bold');
		doc.text(`${total.label}:`, x, y);
		doc.setFont('helvetica', 'normal');
		doc.text(total.value, x + 120, y);

		col++;
		if (col >= 2) {
			col = 0;
			row++;
		}
	});

	yPos += Math.ceil(totals.length / 2) * 20 + 20;

	// Daily Breakdown table
	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('Daily Breakdown', margin, yPos);
	yPos += 6;
	doc.setDrawColor(200);
	doc.setLineWidth(1);
	doc.line(margin, yPos, pageWidth - margin, yPos);
	yPos += 18;

	// Column layout
	const cols = [
		{ label: 'Date', x: margin },
		{ label: 'Tons', x: margin + 100 },
		{ label: 'Loads', x: margin + 200 },
		{ label: 'Distance', x: margin + 280 },
		{ label: 'Hours', x: margin + 380 }
	];

	doc.setFontSize(8);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(100);
	cols.forEach((c) => doc.text(c.label, c.x, yPos));
	yPos += 12;
	doc.setTextColor(0);
	doc.setFont('helvetica', 'normal');

	if (data.days.length === 0) {
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(120);
		doc.text('No production data for this period.', margin, yPos);
		yPos += 16;
		doc.setTextColor(0);
	}

	for (const day of data.days) {
		if (yPos > pageHeight - 80) {
			doc.addPage();
			yPos = margin;
		}

		const dateLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});

		doc.setFontSize(8);
		doc.text(dateLabel, cols[0].x, yPos);
		doc.text(day.tons.toFixed(1), cols[1].x, yPos);
		doc.text(String(day.loads), cols[2].x, yPos);
		doc.text(formatFeet(day.distance_ft), cols[3].x, yPos);
		doc.text(day.hours != null ? day.hours.toFixed(1) : '—', cols[4].x, yPos);
		yPos += 14;
	}

	// Footer on all pages
	const totalPages = doc.getNumberOfPages();
	const machineLabel = getMachineLabel(jobState.machineId);
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i);
		const footerY = pageHeight - 30;
		doc.setFontSize(8);
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(150);
		doc.text(
			`Job: ${jobState.widthFt} ft × ${jobState.thicknessIn}" · ${machineLabel} · PaveRate (paverate.com)`,
			margin,
			footerY
		);
		doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
	}

	const filename = `paverate-${data.periodType}-${data.bounds.start}.pdf`;
	doc.save(filename);
}

/**
 * Generate weekly/monthly report PDF and return as Blob (for sharing via email)
 */
export async function generateWeeklyMonthlyPDFBlob(
	data: WeeklyMonthlyReportData,
	siteName: string,
	orgName: string | undefined,
	jobState: JobState
): Promise<Blob> {
	const jsPDF = await getJsPDF();
	const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const margin = 40;
	let yPos = margin;

	// Load logo
	let logoDataUrl: string | null = null;
	try {
		const logoResponse = await fetch('/logo-wordmark.png');
		if (logoResponse.ok) {
			const logoBuffer = await logoResponse.arrayBuffer();
			const logoBase64 = btoa(
				new Uint8Array(logoBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
			);
			logoDataUrl = `data:image/png;base64,${logoBase64}`;
		}
	} catch {
		// Logo loading failed, continue without it
	}

	// Dark header banner
	const bannerHeight = 55;
	doc.setFillColor(26, 26, 26);
	doc.rect(margin - 5, yPos - 12, pageWidth - margin * 2 + 10, bannerHeight, 'F');

	// Add logo if loaded (top right of banner)
	if (logoDataUrl) {
		try {
			const logoWidth = 80;
			const logoHeight = 24;
			doc.addImage(
				logoDataUrl,
				'PNG',
				pageWidth - margin - logoWidth,
				yPos - 6,
				logoWidth,
				logoHeight
			);
		} catch {
			// Image add failed, continue without logo
		}
	}

	// Title in banner
	doc.setFontSize(18);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(255, 255, 255);
	const title = data.periodType === 'week' ? 'Weekly Production Report' : 'Monthly Production Report';
	doc.text(title, margin, yPos + 8);

	doc.setFontSize(11);
	doc.setFont('helvetica', 'normal');
	doc.text(data.period, margin, yPos + 26);

	yPos += bannerHeight + 8;

	// Site name and org name below banner
	doc.setTextColor(60);
	doc.setFontSize(10);
	if (siteName) {
		doc.text(siteName, margin, yPos);
	}
	if (orgName) {
		doc.text(orgName, pageWidth - margin, yPos, { align: 'right' });
	}
	yPos += 20;

	// Yellow accent line
	doc.setDrawColor(242, 192, 55);
	doc.setLineWidth(2);
	doc.line(margin, yPos, pageWidth - margin, yPos);
	yPos += 20;

	// Period range
	doc.setTextColor(0);
	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');
	const dateRange = `${new Date(data.bounds.start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(data.bounds.end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
	doc.text(dateRange, margin, yPos);
	yPos += 20;

	// Totals section
	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('Production Totals', margin, yPos);
	yPos += 16;

	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');

	const totals = [
		{ label: 'Total Tons', value: data.totals.tons.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
		{ label: 'Total Loads', value: String(data.totals.loads) },
		{ label: 'Total Distance', value: formatFeet(data.totals.distance_ft) },
		{ label: 'Days Worked', value: String(data.totals.days_worked) },
		{ label: 'Avg Tons/Day', value: data.totals.avg_tons_per_day.toFixed(1) }
	];

	// Totals in 2-column grid
	const colWidth = (pageWidth - margin * 2) / 2;
	let col = 0;
	let row = 0;

	totals.forEach((total) => {
		const x = margin + col * colWidth;
		const y = yPos + row * 20;

		doc.setFont('helvetica', 'bold');
		doc.text(`${total.label}:`, x, y);
		doc.setFont('helvetica', 'normal');
		doc.text(total.value, x + 120, y);

		col++;
		if (col >= 2) {
			col = 0;
			row++;
		}
	});

	yPos += Math.ceil(totals.length / 2) * 20 + 20;

	// Daily Breakdown table
	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('Daily Breakdown', margin, yPos);
	yPos += 6;
	doc.setDrawColor(200);
	doc.setLineWidth(1);
	doc.line(margin, yPos, pageWidth - margin, yPos);
	yPos += 18;

	// Column layout
	const cols = [
		{ label: 'Date', x: margin },
		{ label: 'Tons', x: margin + 100 },
		{ label: 'Loads', x: margin + 200 },
		{ label: 'Distance', x: margin + 280 },
		{ label: 'Hours', x: margin + 380 }
	];

	doc.setFontSize(8);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(100);
	cols.forEach((c) => doc.text(c.label, c.x, yPos));
	yPos += 12;
	doc.setTextColor(0);
	doc.setFont('helvetica', 'normal');

	if (data.days.length === 0) {
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(120);
		doc.text('No production data for this period.', margin, yPos);
		yPos += 16;
		doc.setTextColor(0);
	}

	for (const day of data.days) {
		if (yPos > pageHeight - 80) {
			doc.addPage();
			yPos = margin;
		}

		const dateLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});

		doc.setFontSize(8);
		doc.text(dateLabel, cols[0].x, yPos);
		doc.text(day.tons.toFixed(1), cols[1].x, yPos);
		doc.text(String(day.loads), cols[2].x, yPos);
		doc.text(formatFeet(day.distance_ft), cols[3].x, yPos);
		doc.text(day.hours != null ? day.hours.toFixed(1) : '—', cols[4].x, yPos);
		yPos += 14;
	}

	// Footer on all pages
	const totalPages = doc.getNumberOfPages();
	const machineLabel = getMachineLabel(jobState.machineId);
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i);
		const footerY = pageHeight - 30;
		doc.setFontSize(8);
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(150);
		doc.text(
			`Job: ${jobState.widthFt} ft × ${jobState.thicknessIn}" · ${machineLabel} · PaveRate (paverate.com)`,
			margin,
			footerY
		);
		doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
	}

	return doc.output('blob');
}

// ---- Helper functions for SharePDFButton to return Blob instead of saving ----

/**
 * Returns a Blob for daily report PDF for email attachment
 */
export async function getDailyReportPDFBlob(
	jobState: JobState,
	day: DailyReportData,
	signatureDataUrl?: string
): Promise<Blob> {
	// Generate the PDF exactly like generateDailyReportPDF but return blob
	// The logic is duplicated to avoid complex refactoring
	const jsPDF = await getJsPDF();
	const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
	
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const margin = 40;
	let yPos = margin;

	const dateLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});

	// Load logo
	let logoDataUrl: string | null = null;
	try {
		const logoResponse = await fetch('/logo-wordmark.png');
		if (logoResponse.ok) {
			const logoBuffer = await logoResponse.arrayBuffer();
			const logoBase64 = btoa(
				new Uint8Array(logoBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
			);
			logoDataUrl = `data:image/png;base64,${logoBase64}`;
		}
	} catch {
		// Logo loading failed, continue without it
	}

	// Dark header banner
	const bannerHeight = 55;
	doc.setFillColor(26, 26, 26);
	doc.rect(margin - 5, yPos - 12, pageWidth - margin * 2 + 10, bannerHeight, 'F');

	if (logoDataUrl) {
		try {
			const logoWidth = 80;
			const logoHeight = 24;
			doc.addImage(logoDataUrl, 'PNG', pageWidth - margin - logoWidth, yPos - 6, logoWidth, logoHeight);
		} catch {
			// Ignore
		}
	}

	doc.setFontSize(18);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(255, 255, 255);
	doc.text('Daily Production Report', margin, yPos + 8);
	doc.setFontSize(11);
	doc.setFont('helvetica', 'normal');
	doc.text(dateLabel, margin, yPos + 26);
	yPos += bannerHeight + 8;

	doc.setTextColor(60);
	doc.setFontSize(10);
	if (day.siteName) {
		doc.text(day.siteName, margin, yPos);
	}
	if (day.orgName) {
		doc.text(day.orgName, pageWidth - margin, yPos, { align: 'right' });
	}
	yPos += 20;

	doc.setDrawColor(242, 192, 55);
	doc.setLineWidth(2);
	doc.line(margin, yPos, pageWidth - margin, yPos);
	yPos += 20;

	// Simple summary for email attachment
	doc.setTextColor(0);
	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('Production Summary', margin, yPos);
	yPos += 16;

	const t = day.totals;
	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');
	doc.text(`Tons placed: ${t.totalTons.toFixed(1)} | Distance: ${formatFeet(t.totalDistanceFt)} | Loads: ${t.totalLoads}`, margin, yPos);
	yPos += 14;

	if (day.notes) {
		yPos += 10;
		doc.setFontSize(11);
		doc.setFont('helvetica', 'bold');
		doc.text('Notes', margin, yPos);
		yPos += 14;
		doc.setFontSize(9);
		doc.setFont('helvetica', 'normal');
		const noteLines = doc.splitTextToSize(day.notes, pageWidth - margin * 2);
		doc.text(noteLines, margin, yPos);
	}

	const totalPages = doc.getNumberOfPages();
	const machineLabel = getMachineLabel(jobState.machineId);
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i);
		const footerY = pageHeight - 30;
		doc.setFontSize(8);
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(150);
		doc.text(`Job: ${jobState.widthFt} ft × ${jobState.thicknessIn}" · ${machineLabel} · PaveRate (paverate.com)`, margin, footerY);
		doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
	}

	return doc.output('blob');
}

/**
 * Returns a Blob for weekly/monthly report PDF for email attachment
 */
export async function getWeeklyMonthlyPDFBlob(
	data: WeeklyMonthlyReportData,
	siteName: string,
	orgName: string | undefined,
	jobState: JobState
): Promise<Blob> {
	const jsPDF = await getJsPDF();
	const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const margin = 40;
	let yPos = margin;

	// Load logo
	let logoDataUrl: string | null = null;
	try {
		const logoResponse = await fetch('/logo-wordmark.png');
		if (logoResponse.ok) {
			const logoBuffer = await logoResponse.arrayBuffer();
			const logoBase64 = btoa(
				new Uint8Array(logoBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
			);
			logoDataUrl = `data:image/png;base64,${logoBase64}`;
		}
	} catch {
		// Continue without logo
	}

	const bannerHeight = 55;
	doc.setFillColor(26, 26, 26);
	doc.rect(margin - 5, yPos - 12, pageWidth - margin * 2 + 10, bannerHeight, 'F');

	if (logoDataUrl) {
		try {
			doc.addImage(logoDataUrl, 'PNG', pageWidth - margin - 80, yPos - 6, 80, 24);
		} catch {
			// Ignore
		}
	}

	doc.setFontSize(18);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(255, 255, 255);
	const title = data.periodType === 'week' ? 'Weekly Production Report' : 'Monthly Production Report';
	doc.text(title, margin, yPos + 8);
	doc.setFontSize(11);
	doc.setFont('helvetica', 'normal');
	doc.text(data.period, margin, yPos + 26);
	yPos += bannerHeight + 8;

	doc.setTextColor(60);
	doc.setFontSize(10);
	if (siteName) {
		doc.text(siteName, margin, yPos);
	}
	if (orgName) {
		doc.text(orgName, pageWidth - margin, yPos, { align: 'right' });
	}
	yPos += 20;

	doc.setDrawColor(242, 192, 55);
	doc.setLineWidth(2);
	doc.line(margin, yPos, pageWidth - margin, yPos);
	yPos += 20;

	doc.setTextColor(0);
	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('Production Totals', margin, yPos);
	yPos += 16;

	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');
	doc.text(`Total Tons: ${data.totals.tons.toFixed(1)} | Loads: ${data.totals.loads} | Distance: ${formatFeet(data.totals.distance_ft)}`, margin, yPos);
	yPos += 14;
	doc.text(`Days Worked: ${data.totals.days_worked} | Avg Tons/Day: ${data.totals.avg_tons_per_day.toFixed(1)}`, margin, yPos);

	const totalPages = doc.getNumberOfPages();
	const machineLabel = getMachineLabel(jobState.machineId);
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i);
		const footerY = pageHeight - 30;
		doc.setFontSize(8);
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(150);
		doc.text(`Job: ${jobState.widthFt} ft × ${jobState.thicknessIn}" · ${machineLabel} · PaveRate (paverate.com)`, margin, footerY);
		doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
	}

	return doc.output('blob');
}
