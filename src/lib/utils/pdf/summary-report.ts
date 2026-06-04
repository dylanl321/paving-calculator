// Weekly/monthly production report PDF generators
import type { JobState, WeeklyMonthlyReportData } from './shared';
import { getJsPDF, getMachineLabel, formatFeet } from './shared';

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
