// CSV export utilities for PaveRate reports

function escapeCSV(value: string | number | null | undefined): string {
	if (value == null) return '';
	const str = String(value);
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

function downloadCSV(content: string, filename: string): void {
	const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.style.display = 'none';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

export interface DailySummaryCSVParams {
	date: string;
	siteName: string;
	entries: any[];
	loads: any[];
	densityReadings: any[];
	summary: {
		total_tons: number;
		total_loads: number;
		total_distance_ft: number;
		total_tack_gallons: number;
		hours_worked: number;
	};
}

export function exportDailySummaryCSV(params: DailySummaryCSVParams): void {
	const { date, siteName, entries, loads, densityReadings, summary } = params;
	const lines: string[] = [];

	// Section 1: Summary header
	lines.push('Date,Site,Total Tons,Total Loads,Total Feet,Hours Worked');
	lines.push(
		[
			escapeCSV(date),
			escapeCSV(siteName),
			escapeCSV(summary.total_tons.toFixed(1)),
			escapeCSV(summary.total_loads),
			escapeCSV(summary.total_distance_ft),
			escapeCSV(summary.hours_worked.toFixed(1))
		].join(',')
	);
	lines.push('');

	// Section 2: Entries
	lines.push(
		'Type,Time,Tons Placed,Distance (ft),Spread Rate (lbs/SY),Station Start,Station End,Lane,Tack (gal),Notes'
	);
	entries.forEach((e) => {
		lines.push(
			[
				escapeCSV(e.entry_type),
				escapeCSV(e.timestamp),
				escapeCSV(e.tons_placed != null ? e.tons_placed.toFixed(1) : ''),
				escapeCSV(e.distance_ft),
				escapeCSV(e.spread_rate_actual != null ? Math.round(e.spread_rate_actual) : ''),
				escapeCSV(e.station_start != null ? `${e.station_start}+00` : ''),
				escapeCSV(e.station_end != null ? `${e.station_end}+00` : ''),
				escapeCSV(e.lane),
				escapeCSV(e.tack_gallons != null ? Math.round(e.tack_gallons) : ''),
				escapeCSV(e.notes)
			].join(',')
		);
	});

	// Section 3: Load tickets (if present)
	if (loads.length > 0) {
		lines.push('');
		lines.push('LOAD TICKETS');
		lines.push('Time,Ticket #,Tons,Spread Rate (lbs/SY),Notes');
		loads.forEach((load) => {
			const timeStr = new Date(load.timestamp * 1000).toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit',
				hour12: true
			});
			lines.push(
				[
					escapeCSV(timeStr),
					escapeCSV(load.ticket_number),
					escapeCSV(load.tons.toFixed(1)),
					escapeCSV(load.spread_rate != null ? Math.round(load.spread_rate) : ''),
					escapeCSV(load.notes)
				].join(',')
			);
		});
	}

	// Section 4: Density readings (if present)
	if (densityReadings.length > 0) {
		lines.push('');
		lines.push('DENSITY READINGS');
		lines.push('Time,Reading (%),Target (%),Pass/Fail,Notes');
		densityReadings.forEach((reading) => {
			const passFail =
				reading.compaction_pct != null ? (reading.compaction_pct >= 95 ? 'Pass' : 'Fail') : '';
			lines.push(
				[
					escapeCSV(reading.station_number),
					escapeCSV(reading.compaction_pct != null ? reading.compaction_pct.toFixed(1) : ''),
					escapeCSV('95'),
					escapeCSV(passFail),
					escapeCSV(reading.notes)
				].join(',')
			);
		});
	}

	const filename = `paverate-daily-${date}.csv`;
	downloadCSV(lines.join('\n'), filename);
}

export interface RollupCSVParams {
	period: string;
	periodType: 'week' | 'month';
	siteName: string;
	data: {
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
	};
}

export function exportRollupCSV(params: RollupCSVParams): void {
	const { period, periodType, siteName, data } = params;
	const lines: string[] = [];

	// Header
	lines.push(`${periodType === 'week' ? 'Weekly' : 'Monthly'} Production Report`);
	lines.push(`Period: ${escapeCSV(period)}`);
	lines.push(`Site: ${escapeCSV(siteName)}`);
	lines.push('');

	// Totals summary
	lines.push('SUMMARY');
	lines.push('Metric,Value');
	lines.push(`Total Tons,${data.totals.tons.toFixed(1)}`);
	lines.push(`Total Loads,${data.totals.loads}`);
	lines.push(`Total Distance (ft),${data.totals.distance_ft}`);
	lines.push(`Days Worked,${data.totals.days_worked}`);
	lines.push(`Avg Tons/Day,${data.totals.avg_tons_per_day.toFixed(1)}`);
	lines.push('');

	// Daily breakdown
	lines.push('DAILY BREAKDOWN');
	lines.push('Date,Tons,Loads,Distance (ft),Hours');
	data.days.forEach((day) => {
		lines.push(
			[
				escapeCSV(day.date),
				escapeCSV(day.tons.toFixed(1)),
				escapeCSV(day.loads),
				escapeCSV(day.distance_ft),
				escapeCSV(day.hours?.toFixed(1) ?? '')
			].join(',')
		);
	});

	// Totals row
	lines.push(
		[
			'TOTAL',
			escapeCSV(data.totals.tons.toFixed(1)),
			escapeCSV(data.totals.loads),
			escapeCSV(data.totals.distance_ft),
			''
		].join(',')
	);

	const dateStr = data.bounds.start;
	const filename = `paverate-${periodType}-${dateStr}.csv`;
	downloadCSV(lines.join('\n'), filename);
}
