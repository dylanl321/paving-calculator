import { describe, it, expect } from 'vitest';
import { buildReportRows, reportsHeadline } from '$lib/reports';

const jobs = [
	{ id: 'a', name: 'SR-20' },
	{ id: 'b', name: 'Hwy 92' }
];

describe('buildReportRows', () => {
	it('sorts newest first and labels status', () => {
		const rows = buildReportRows(jobs, {
			a: [
				{ id: '1', log_date: '2026-11-12', closed_at: 1, foreman_name: 'Marcus' },
				{ id: '2', log_date: '2026-11-14', closed_at: null, foreman_name: null }
			],
			b: [{ id: '3', log_date: '2026-11-14', closed_at: 5, foreman_name: null }]
		});
		expect(rows.map((r) => r.logId)).toEqual(['3', '2', '1']);
		expect(rows[0].status).toBe('Closed');
		expect(rows[1].status).toBe('Open');
		expect(rows[2].status).toBe('Closed by Marcus');
	});
});

describe('reportsHeadline', () => {
	it('flags past days that are still open', () => {
		const rows = buildReportRows(jobs, {
			a: [{ id: '1', log_date: '2026-11-13', closed_at: null, foreman_name: null }],
			b: [{ id: '2', log_date: '2026-11-14', closed_at: null, foreman_name: null }]
		});
		const h = reportsHeadline(rows, '2026-11-14');
		expect(h.title).toBe('1 past day is still open');
		expect(h.subtitle).toContain('SR-20');
	});

	it('says everything is closed when only today is open', () => {
		const rows = buildReportRows(jobs, {
			b: [{ id: '2', log_date: '2026-11-14', closed_at: null, foreman_name: null }]
		});
		expect(reportsHeadline(rows, '2026-11-14')).toEqual({
			title: 'Every past day is closed',
			subtitle: '1 job is logging today.'
		});
	});

	it('handles no logs', () => {
		expect(reportsHeadline([], '2026-11-14').title).toBe('No daily reports yet');
	});
});
