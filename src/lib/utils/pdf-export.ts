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
