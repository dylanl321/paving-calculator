// Daily production report PDF generators
import type { JobState, DailyReportData } from './shared';
import { getJsPDF, getMachineLabel, formatFeet, spreadSpecCheck, addGdotHeaderBlock } from './shared';

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
	// GDOT-format header block
	const weatherStr1 = [
		day.weatherTempF != null ? `${day.weatherTempF}\u00b0F` : '',
		day.weatherConditions
			? day.weatherConditions.charAt(0).toUpperCase() + day.weatherConditions.slice(1)
			: ''
	]
		.filter(Boolean)
		.join(', ');
	const dateStr1 = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
		month: '2-digit',
		day: '2-digit',
		year: 'numeric'
	});
	yPos = addGdotHeaderBlock(doc, yPos, pageWidth, margin, {
		projectNumber: day.gdotProjectNumber ?? null,
		county: day.gdotCounty ?? null,
		route: day.gdotRoute ?? null,
		contractor: day.gdotContractor ?? day.orgName ?? null,
		weather: weatherStr1 || null,
		date: dateStr1
	});

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
	// GDOT-format header block
	const weatherStr2 = [
		day.weatherTempF != null ? `${day.weatherTempF}\u00b0F` : '',
		day.weatherConditions
			? day.weatherConditions.charAt(0).toUpperCase() + day.weatherConditions.slice(1)
			: ''
	]
		.filter(Boolean)
		.join(', ');
	const dateStr2 = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
		month: '2-digit',
		day: '2-digit',
		year: 'numeric'
	});
	yPos = addGdotHeaderBlock(doc, yPos, pageWidth, margin, {
		projectNumber: day.gdotProjectNumber ?? null,
		county: day.gdotCounty ?? null,
		route: day.gdotRoute ?? null,
		contractor: day.gdotContractor ?? day.orgName ?? null,
		weather: weatherStr2 || null,
		date: dateStr2
	});

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
	// GDOT-format header block
	const weatherStr3 = [
		day.weatherTempF != null ? `${day.weatherTempF}\u00b0F` : '',
		day.weatherConditions
			? day.weatherConditions.charAt(0).toUpperCase() + day.weatherConditions.slice(1)
			: ''
	]
		.filter(Boolean)
		.join(', ');
	const dateStr3 = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
		month: '2-digit',
		day: '2-digit',
		year: 'numeric'
	});
	yPos = addGdotHeaderBlock(doc, yPos, pageWidth, margin, {
		projectNumber: day.gdotProjectNumber ?? null,
		county: day.gdotCounty ?? null,
		route: day.gdotRoute ?? null,
		contractor: day.gdotContractor ?? day.orgName ?? null,
		weather: weatherStr3 || null,
		date: dateStr3
	});

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
