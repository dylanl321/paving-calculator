// PDF proof sheet generator for PaveRate calculations.
// Captures job setup parameters and provides templates for calculator sections.
import type { JobState } from '$lib/stores/job.svelte';

async function getJsPDF() {
	try {
		const module = await import('jspdf');
		return module.jsPDF;
	} catch {
		const stub = await import('./jspdf-stub');
		return stub.jsPDF;
	}
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
	doc: jsPDF,
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

export interface DailyReportData {
	date: string; // YYYY-MM-DD
	siteName: string;
	weatherTempF: number | null;
	weatherConditions: string | null;
	windSpeedMph: number | null;
	crewCount: number | null;
	startTime: string | null;
	endTime: string | null;
	notes: string | null;
	entries: DailyReportEntry[];
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
}

function fmtFeet(ft: number | null): string {
	if (ft == null) return '—';
	if (ft >= 5280) return `${(ft / 5280).toFixed(2)} mi`;
	return `${Math.round(ft).toLocaleString()} ft`;
}

export async function generateDailyReportPDF(
	jobState: JobState,
	day: DailyReportData
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

	// Header
	doc.setFontSize(20);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(0);
	doc.text('PaveRate — Daily Production Report', margin, yPos);
	yPos += 26;

	doc.setFontSize(11);
	doc.setFont('helvetica', 'normal');
	doc.setTextColor(60);
	doc.text(dateLabel, margin, yPos);
	if (day.siteName) {
		doc.text(day.siteName, pageWidth - margin, yPos, { align: 'right' });
	}
	yPos += 22;

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
		`Paved: ${fmtFeet(t.totalDistanceFt)}`,
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
		doc.text(e.distance_ft != null ? fmtFeet(e.distance_ft) : '—', cols[4].x, yPos);
		doc.text(e.spread_rate_actual != null ? String(Math.round(e.spread_rate_actual)) : '—', cols[5].x, yPos);
		const detailLines = doc.splitTextToSize(detail || '—', pageWidth - margin - cols[6].x);
		doc.text(detailLines, cols[6].x, yPos);
		yPos += Math.max(14, detailLines.length * 10);
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
