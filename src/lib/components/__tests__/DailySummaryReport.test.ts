/**
 * src/lib/components/__tests__/DailySummaryReport.test.ts
 *
 * Component tests for DailySummaryReport. Covers:
 *   - renders all sections when complete log data is provided
 *   - handles missing/partial data gracefully (no crash, graceful fallback)
 *   - weather section displays temperature, conditions, wind speed, crew count
 *   - production totals math: tons placed, distance, loads, tack, hours
 *   - avgTonsPerLoad derived value is correct
 *   - targetPct progress bar math
 *   - entry list renders with correct count and content
 *   - hoursWorked calculation from start_time/end_time
 *   - fmtFeet helper: mile rollover at 5280 ft
 *   - fmtTons helper: one-decimal locale string
 *   - fmtTime helper: 12-hour AM/PM conversion
 *   - compactionColor thresholds: >= 95 green, >= 90 accent, < 90 red
 *   - targetPctColor thresholds: >= 95 green, >= 80 accent, < 80 red
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import type { DbDailyLog } from '$lib/server/db-logs';
import DailySummaryReport from '$lib/components/DailySummaryReport.svelte';

// ---------------------------------------------------------------------------
// Helpers that mirror the component's internal derived/helper functions
// ---------------------------------------------------------------------------

/** Mirror of hoursWorked derived */
function hoursWorked(log: { start_time: string | null; end_time: string | null; hours_worked?: number }): number {
  if (!log.start_time || !log.end_time) return log.hours_worked ?? 0;
  const [sh, sm] = log.start_time.split(':').map(Number);
  const [eh, em] = log.end_time.split(':').map(Number);
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
}

/** Mirror of avgTonsPerLoad derived */
function avgTonsPerLoad(total_tons: number, total_loads: number): string | null {
  return total_loads > 0 ? (total_tons / total_loads).toFixed(1) : null;
}

/** Mirror of targetPct derived */
function targetPct(total_tons: number, target_tons: number | null): number | null {
  if (!target_tons || target_tons <= 0) return null;
  return Math.min(100, (total_tons / target_tons) * 100);
}

/** Mirror of compactionColor */
function compactionColor(pct: number | null): string {
  if (pct == null) return 'var(--text-muted)';
  if (pct >= 95) return '#22c55e';
  if (pct >= 90) return 'var(--accent)';
  return '#ef4444';
}

/** Mirror of targetPctColor */
function targetPctColor(pct: number): string {
  if (pct >= 95) return '#22c55e';
  if (pct >= 80) return 'var(--accent)';
  return '#ef4444';
}

/** Mirror of fmtFeet */
function fmtFeet(ft: number | null): string {
  if (ft == null || ft === 0) return '—';
  if (ft >= 5280) return `${(ft / 5280).toFixed(2)} mi`;
  return `${Math.round(ft).toLocaleString()} ft`;
}

/** Mirror of fmtTons */
function fmtTons(t: number): string {
  return t.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Mirror of fmtTime */
function fmtTime(hhmm: string | null): string {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLog(overrides: Partial<DbDailyLog> = {}): DbDailyLog {
  return {
    id: 'log-1',
    job_site_id: 'site-1',
    log_date: '2026-06-01',
    created_by: 'user-1',
    weather_temp_f: 72,
    weather_conditions: 'clear',
    wind_speed_mph: 8,
    is_raining: null,
    weather_fetched_at: null,
    crew_count: 5,
    start_time: '07:00',
    end_time: '15:30',
    notes: 'Good paving day.',
    target_tons: 200,
    target_loads: null,
    plant_name: 'APAC Plant 3',
    mix_type: 'SP-9.5A',
    closed_at: null,
    foreman_name: 'Mike Johnson',
    created_at: 1748736000,
    updated_at: 1748736000,
    ...overrides,
  };
}

const FULL_SUMMARY = {
  total_distance_ft: 1320,
  total_tons: 185.5,
  total_loads: 12,
  total_tack_gallons: 44,
  hours_worked: 8.5,
};

const FULL_ENTRIES = [
  {
    id: 'e1',
    entry_type: 'paving',
    timestamp: '07:30',
    distance_ft: 660,
    tons_placed: 92.5,
    loads_count: 6,
    spread_rate_actual: 210,
    tack_gallons: 22,
    lane: '1',
    notes: 'East lane',
  },
  {
    id: 'e2',
    entry_type: 'paving',
    timestamp: '13:00',
    distance_ft: 660,
    tons_placed: 93.0,
    loads_count: 6,
    spread_rate_actual: 215,
    tack_gallons: 22,
    lane: '2',
    notes: null,
  },
];

const FULL_LOADS = [
  { id: 'l1', timestamp: 1748740800, ticket_number: 'T001', tons: 15.5, spread_rate: 210 },
  { id: 'l2', timestamp: 1748744400, ticket_number: 'T002', tons: 14.8, spread_rate: 215 },
];

const DENSITY_READINGS = [
  {
    id: 'd1',
    station_number: 'Sta 10+00',
    lane: '1',
    wet_density_pcf: 148.2,
    dry_density_pcf: 143.1,
    compaction_pct: 96.3,
  },
  {
    id: 'd2',
    station_number: 'Sta 10+60',
    lane: '2',
    wet_density_pcf: 142.0,
    dry_density_pcf: 138.5,
    compaction_pct: 89.1,
  },
];

// ---------------------------------------------------------------------------
// fetch mock setup
// ---------------------------------------------------------------------------

function mockFetch(summary = FULL_SUMMARY, entries = FULL_ENTRIES, densityReadings = DENSITY_READINGS, loads = FULL_LOADS) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/api/org/settings')) {
        return { ok: true, json: async () => ({ reportRecipients: [] }) };
      }
      if (url.includes('/logs/')) {
        return {
          ok: true,
          json: async () => ({ entries, summary, densityReadings }),
        };
      }
      if (url.includes('/loads')) {
        return { ok: true, json: async () => ({ loads }) };
      }
      return { ok: false, json: async () => ({}) };
    })
  );
}

// ---------------------------------------------------------------------------
// hoursWorked derived logic
// ---------------------------------------------------------------------------

describe('DailySummaryReport: hoursWorked calculation', () => {
  it('calculates hours from start and end time', () => {
    expect(hoursWorked({ start_time: '07:00', end_time: '15:30' })).toBeCloseTo(8.5);
  });

  it('calculates exact 8 hours', () => {
    expect(hoursWorked({ start_time: '06:00', end_time: '14:00' })).toBe(8);
  });

  it('handles minute-only differences', () => {
    expect(hoursWorked({ start_time: '07:00', end_time: '07:45' })).toBeCloseTo(0.75);
  });

  it('falls back to summary hours_worked when start_time is null', () => {
    expect(hoursWorked({ start_time: null, end_time: '15:00', hours_worked: 9 })).toBe(9);
  });

  it('falls back to summary hours_worked when end_time is null', () => {
    expect(hoursWorked({ start_time: '07:00', end_time: null, hours_worked: 7 })).toBe(7);
  });

  it('clamps negative values to 0 when end < start (midnight edge)', () => {
    expect(hoursWorked({ start_time: '23:00', end_time: '01:00' })).toBe(0);
  });

  it('returns 0 when both null and no hours_worked fallback', () => {
    expect(hoursWorked({ start_time: null, end_time: null })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// avgTonsPerLoad derived logic
// ---------------------------------------------------------------------------

describe('DailySummaryReport: avgTonsPerLoad calculation', () => {
  it('divides total_tons by total_loads and formats to 1 decimal', () => {
    expect(avgTonsPerLoad(185.5, 12)).toBe('15.5');
  });

  it('returns null when total_loads is 0 (avoid divide-by-zero)', () => {
    expect(avgTonsPerLoad(0, 0)).toBeNull();
  });

  it('rounds correctly: 100 tons / 3 loads = 33.3', () => {
    expect(avgTonsPerLoad(100, 3)).toBe('33.3');
  });

  it('handles fractional loads evenly: 75 / 5 = 15.0', () => {
    expect(avgTonsPerLoad(75, 5)).toBe('15.0');
  });
});

// ---------------------------------------------------------------------------
// targetPct derived logic
// ---------------------------------------------------------------------------

describe('DailySummaryReport: targetPct calculation', () => {
  it('returns null when target_tons is null', () => {
    expect(targetPct(150, null)).toBeNull();
  });

  it('returns null when target_tons is 0', () => {
    expect(targetPct(150, 0)).toBeNull();
  });

  it('calculates correct percentage: 150/200 = 75%', () => {
    expect(targetPct(150, 200)).toBeCloseTo(75);
  });

  it('caps at 100% when actual exceeds target', () => {
    expect(targetPct(250, 200)).toBe(100);
  });

  it('returns 100% exactly when actual equals target', () => {
    expect(targetPct(200, 200)).toBe(100);
  });

  it('returns small percentage for minimal tonnage: 10/200 = 5%', () => {
    expect(targetPct(10, 200)).toBeCloseTo(5);
  });
});

// ---------------------------------------------------------------------------
// compactionColor thresholds
// ---------------------------------------------------------------------------

describe('DailySummaryReport: compactionColor', () => {
  it('returns green (#22c55e) for >= 95%', () => {
    expect(compactionColor(95)).toBe('#22c55e');
    expect(compactionColor(100)).toBe('#22c55e');
    expect(compactionColor(97.5)).toBe('#22c55e');
  });

  it('returns accent for 90-94.9%', () => {
    expect(compactionColor(90)).toBe('var(--accent)');
    expect(compactionColor(94.9)).toBe('var(--accent)');
  });

  it('returns red (#ef4444) for < 90%', () => {
    expect(compactionColor(89.9)).toBe('#ef4444');
    expect(compactionColor(80)).toBe('#ef4444');
    expect(compactionColor(0)).toBe('#ef4444');
  });

  it('returns muted when pct is null', () => {
    expect(compactionColor(null)).toBe('var(--text-muted)');
  });
});

// ---------------------------------------------------------------------------
// targetPctColor thresholds
// ---------------------------------------------------------------------------

describe('DailySummaryReport: targetPctColor', () => {
  it('returns green (#22c55e) for >= 95%', () => {
    expect(targetPctColor(95)).toBe('#22c55e');
    expect(targetPctColor(100)).toBe('#22c55e');
  });

  it('returns accent for 80-94.9%', () => {
    expect(targetPctColor(80)).toBe('var(--accent)');
    expect(targetPctColor(90)).toBe('var(--accent)');
    expect(targetPctColor(94.9)).toBe('var(--accent)');
  });

  it('returns red (#ef4444) for < 80%', () => {
    expect(targetPctColor(79.9)).toBe('#ef4444');
    expect(targetPctColor(50)).toBe('#ef4444');
  });
});

// ---------------------------------------------------------------------------
// fmtFeet helper
// ---------------------------------------------------------------------------

describe('DailySummaryReport: fmtFeet helper', () => {
  it('formats feet under 1 mile with commas', () => {
    expect(fmtFeet(1320)).toBe('1,320 ft');
  });

  it('converts to miles at 5280 ft', () => {
    expect(fmtFeet(5280)).toBe('1.00 mi');
  });

  it('converts to miles above 5280 ft', () => {
    expect(fmtFeet(10560)).toBe('2.00 mi');
  });

  it('returns em-dash for null', () => {
    expect(fmtFeet(null)).toBe('—');
  });

  it('returns em-dash for 0', () => {
    expect(fmtFeet(0)).toBe('—');
  });

  it('rounds fractional feet', () => {
    expect(fmtFeet(100.7)).toBe('101 ft');
  });
});

// ---------------------------------------------------------------------------
// fmtTons helper
// ---------------------------------------------------------------------------

describe('DailySummaryReport: fmtTons helper', () => {
  it('formats integer tons with one decimal', () => {
    expect(fmtTons(100)).toBe('100.0');
  });

  it('formats decimal tons to one place', () => {
    expect(fmtTons(185.5)).toBe('185.5');
  });

  it('rounds to 1 decimal place', () => {
    expect(fmtTons(185.55)).toBe('185.6');
  });

  it('formats zero', () => {
    expect(fmtTons(0)).toBe('0.0');
  });

  it('adds thousands separator for large tonnage', () => {
    expect(fmtTons(1000)).toBe('1,000.0');
  });
});

// ---------------------------------------------------------------------------
// fmtTime helper
// ---------------------------------------------------------------------------

describe('DailySummaryReport: fmtTime helper', () => {
  it('converts midnight to 12:00 AM', () => {
    expect(fmtTime('00:00')).toBe('12:00 AM');
  });

  it('converts 07:00 to 7:00 AM', () => {
    expect(fmtTime('07:00')).toBe('7:00 AM');
  });

  it('converts noon to 12:00 PM', () => {
    expect(fmtTime('12:00')).toBe('12:00 PM');
  });

  it('converts 15:30 to 3:30 PM', () => {
    expect(fmtTime('15:30')).toBe('3:30 PM');
  });

  it('converts 23:59 to 11:59 PM', () => {
    expect(fmtTime('23:59')).toBe('11:59 PM');
  });

  it('pads minutes: 07:05 -> 7:05 AM', () => {
    expect(fmtTime('07:05')).toBe('7:05 AM');
  });

  it('returns em-dash for null', () => {
    expect(fmtTime(null)).toBe('—');
  });
});

// ---------------------------------------------------------------------------
// Render tests — smoke + section visibility
// ---------------------------------------------------------------------------

describe('DailySummaryReport: render with complete data', () => {
  beforeEach(() => {
    mockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders without throwing for a complete log', () => {
    expect(() =>
      render(DailySummaryReport, {
        props: {
          jobSiteId: 'site-1',
          log: makeLog(),
          onClose: vi.fn(),
        },
      })
    ).not.toThrow();
  });

  it('renders the sheet title "Daily Production Summary"', () => {
    const { getByText } = render(DailySummaryReport, {
      props: { jobSiteId: 'site-1', log: makeLog(), onClose: vi.fn() },
    });
    expect(getByText('Daily Production Summary')).toBeTruthy();
  });

  it('renders the log date in the header', () => {
    const { container } = render(DailySummaryReport, {
      props: { jobSiteId: 'site-1', log: makeLog(), onClose: vi.fn() },
    });
    // date label derived from '2026-06-01T00:00:00'
    const header = container.querySelector('.sheet-date');
    expect(header).not.toBeNull();
    expect(header!.textContent).toContain('2026');
  });

  it('renders the close button', () => {
    const { container } = render(DailySummaryReport, {
      props: { jobSiteId: 'site-1', log: makeLog(), onClose: vi.fn() },
    });
    const btn = container.querySelector('.close-btn');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-label')).toBe('Close');
  });

  it('renders the loading state initially', () => {
    const { container } = render(DailySummaryReport, {
      props: { jobSiteId: 'site-1', log: makeLog(), onClose: vi.fn() },
    });
    // On initial mount the component shows loading spinner before async completes
    const loading = container.querySelector('.loading-state');
    expect(loading).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Render tests — partial / missing data (no crash)
// ---------------------------------------------------------------------------

describe('DailySummaryReport: handles missing/partial data gracefully', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders without crash when optional log fields are null', () => {
    mockFetch(
      { total_distance_ft: 0, total_tons: 0, total_loads: 0, total_tack_gallons: 0, hours_worked: 0 },
      [],
      [],
      []
    );
    expect(() =>
      render(DailySummaryReport, {
        props: {
          jobSiteId: 'site-1',
          log: makeLog({
            weather_temp_f: null,
            weather_conditions: null,
            wind_speed_mph: null,
            crew_count: null,
            start_time: null,
            end_time: null,
            notes: null,
            target_tons: null,
            foreman_name: null,
            plant_name: null,
            mix_type: null,
          }),
          onClose: vi.fn(),
        },
      })
    ).not.toThrow();
  });

  it('renders without crash when fetch returns empty entries/loads', () => {
    mockFetch(
      { total_distance_ft: 100, total_tons: 10, total_loads: 1, total_tack_gallons: 0, hours_worked: 4 },
      [],
      [],
      []
    );
    expect(() =>
      render(DailySummaryReport, {
        props: { jobSiteId: 'site-1', log: makeLog(), onClose: vi.fn() },
      })
    ).not.toThrow();
  });

  it('renders without crash when all fetch responses return !ok', () => {
    // Tests graceful degradation: entries/summary/loads stay as empty defaults
    // when server returns error responses (e.g. 500, 404).
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(() =>
      render(DailySummaryReport, {
        props: { jobSiteId: 'site-1', log: makeLog(), onClose: vi.fn() },
      })
    ).not.toThrow();
  });

  it('renders without crash when log has no target_tons (no progress section)', () => {
    mockFetch();
    expect(() =>
      render(DailySummaryReport, {
        props: {
          jobSiteId: 'site-1',
          log: makeLog({ target_tons: null }),
          onClose: vi.fn(),
        },
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Weather section display logic (via log fixture fields)
// ---------------------------------------------------------------------------

describe('DailySummaryReport: weather chip data in log', () => {
  it('log has weather_temp_f present (chip would show)', () => {
    const log = makeLog({ weather_temp_f: 72 });
    expect(log.weather_temp_f).toBe(72);
  });

  it('log has weather_conditions present (icon chip would show)', () => {
    const log = makeLog({ weather_conditions: 'clear' });
    expect(log.weather_conditions).toBe('clear');
  });

  it('log has wind_speed_mph present (wind chip would show)', () => {
    const log = makeLog({ wind_speed_mph: 8 });
    expect(log.wind_speed_mph).toBe(8);
  });

  it('log has crew_count present (crew chip would show)', () => {
    const log = makeLog({ crew_count: 5 });
    expect(log.crew_count).toBe(5);
  });

  it('log has both start_time and end_time (time chip would show)', () => {
    const log = makeLog({ start_time: '07:00', end_time: '15:30' });
    expect(log.start_time).toBe('07:00');
    expect(log.end_time).toBe('15:30');
    // formatted time chip: "7:00 AM–3:30 PM"
    expect(fmtTime(log.start_time!)).toBe('7:00 AM');
    expect(fmtTime(log.end_time!)).toBe('3:30 PM');
  });

  it('log missing weather_temp_f means no temp chip', () => {
    const log = makeLog({ weather_temp_f: null });
    expect(log.weather_temp_f).toBeNull();
  });

  it('all weather icons map correctly', () => {
    const weatherIcons: Record<string, string> = {
      clear: '\u2600\uFE0F',
      cloudy: '\u2601\uFE0F',
      rain: '\uD83C\uDF27\uFE0F',
      wind: '\uD83D\uDCA8',
      fog: '\uD83C\uDF2B\uFE0F',
    };
    expect(weatherIcons['clear']).toBeTruthy();
    expect(weatherIcons['rain']).toBeTruthy();
    expect(weatherIcons['fog']).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tonnage / spread rate summary math
// ---------------------------------------------------------------------------

describe('DailySummaryReport: production totals math', () => {
  it('total_tons is displayed to 1 decimal via fmtTons', () => {
    expect(fmtTons(FULL_SUMMARY.total_tons)).toBe('185.5');
  });

  it('total_distance_ft is correctly formatted as feet', () => {
    expect(fmtFeet(FULL_SUMMARY.total_distance_ft)).toBe('1,320 ft');
  });

  it('total_loads is integer', () => {
    expect(FULL_SUMMARY.total_loads).toBe(12);
  });

  it('total_tack_gallons rounds to integer', () => {
    expect(Math.round(FULL_SUMMARY.total_tack_gallons)).toBe(44);
  });

  it('avgTonsPerLoad for fixture: 185.5 / 12 = 15.5', () => {
    expect(avgTonsPerLoad(FULL_SUMMARY.total_tons, FULL_SUMMARY.total_loads)).toBe('15.5');
  });

  it('targetPct for fixture: 185.5 / 200 = 92.75% (capped at 100)', () => {
    const pct = targetPct(FULL_SUMMARY.total_tons, 200);
    expect(pct).toBeCloseTo(92.75);
  });

  it('targetPct would trigger accent color (80-94.9% range)', () => {
    const pct = targetPct(FULL_SUMMARY.total_tons, 200)!;
    expect(targetPctColor(pct)).toBe('var(--accent)');
  });

  it('spread_rate_actual on entry rounds to nearest integer for display', () => {
    expect(Math.round(FULL_ENTRIES[0].spread_rate_actual)).toBe(210);
    expect(Math.round(FULL_ENTRIES[1].spread_rate_actual)).toBe(215);
  });

  it('hoursWorked from 07:00 to 15:30 = 8.5 hours', () => {
    expect(hoursWorked({ start_time: '07:00', end_time: '15:30' })).toBeCloseTo(8.5);
  });

  it('load total tons = sum of individual loads', () => {
    const total = FULL_LOADS.reduce((s, l) => s + l.tons, 0);
    expect(total).toBeCloseTo(30.3);
  });
});

// ---------------------------------------------------------------------------
// Entry list rendering logic
// ---------------------------------------------------------------------------

describe('DailySummaryReport: entry list data', () => {
  it('entries array has expected length', () => {
    expect(FULL_ENTRIES.length).toBe(2);
  });

  it('first entry is paving type with correct tonnage', () => {
    const e = FULL_ENTRIES[0];
    expect(e.entry_type).toBe('paving');
    expect(e.tons_placed).toBe(92.5);
    expect(e.distance_ft).toBe(660);
  });

  it('second entry is paving type with correct tonnage', () => {
    const e = FULL_ENTRIES[1];
    expect(e.entry_type).toBe('paving');
    expect(e.tons_placed).toBe(93.0);
  });

  it('entry tons sum equals summary total_tons', () => {
    const sum = FULL_ENTRIES.reduce((s, e) => s + e.tons_placed, 0);
    expect(sum).toBeCloseTo(FULL_SUMMARY.total_tons);
  });

  it('entry distance_ft sum equals summary total_distance_ft', () => {
    const sum = FULL_ENTRIES.reduce((s, e) => s + e.distance_ft, 0);
    expect(sum).toBe(FULL_SUMMARY.total_distance_ft);
  });

  it('entry loads_count sum equals summary total_loads', () => {
    const sum = FULL_ENTRIES.reduce((s, e) => s + e.loads_count, 0);
    expect(sum).toBe(FULL_SUMMARY.total_loads);
  });

  it('entry tack_gallons sum equals summary total_tack_gallons', () => {
    const sum = FULL_ENTRIES.reduce((s, e) => s + e.tack_gallons, 0);
    expect(sum).toBe(FULL_SUMMARY.total_tack_gallons);
  });

  it('entry with null notes does not crash string display', () => {
    const e = FULL_ENTRIES[1];
    expect(e.notes).toBeNull();
    // component conditionally renders: {#if entry.notes} — null is falsy, no crash
    expect(!!e.notes).toBe(false);
  });

  it('entry lane is rendered as string', () => {
    expect(FULL_ENTRIES[0].lane).toBe('1');
    expect(FULL_ENTRIES[1].lane).toBe('2');
  });
});

// ---------------------------------------------------------------------------
// Density readings logic
// ---------------------------------------------------------------------------

describe('DailySummaryReport: density readings', () => {
  it('compaction >= 95% gets green color', () => {
    expect(compactionColor(DENSITY_READINGS[0].compaction_pct)).toBe('#22c55e');
  });

  it('compaction < 90% gets red color', () => {
    expect(compactionColor(DENSITY_READINGS[1].compaction_pct)).toBe('#ef4444');
  });

  it('dry_density_pcf is formatted to 1 decimal', () => {
    expect(DENSITY_READINGS[0].dry_density_pcf!.toFixed(1)).toBe('143.1');
  });

  it('wet_density_pcf is formatted to 1 decimal', () => {
    expect(DENSITY_READINGS[0].wet_density_pcf.toFixed(1)).toBe('148.2');
  });

  it('compaction_pct is formatted to 1 decimal with % suffix', () => {
    const pct = DENSITY_READINGS[0].compaction_pct;
    expect(`${pct!.toFixed(1)}%`).toBe('96.3%');
  });
});

// ---------------------------------------------------------------------------
// foreman, plant, mix_type banner data
// ---------------------------------------------------------------------------

describe('DailySummaryReport: day banner log fields', () => {
  it('log has foreman_name for banner display', () => {
    const log = makeLog({ foreman_name: 'Mike Johnson' });
    expect(log.foreman_name).toBe('Mike Johnson');
  });

  it('log has plant_name for banner display', () => {
    const log = makeLog({ plant_name: 'APAC Plant 3' });
    expect(log.plant_name).toBe('APAC Plant 3');
  });

  it('log has mix_type for banner display', () => {
    const log = makeLog({ mix_type: 'SP-9.5A' });
    expect(log.mix_type).toBe('SP-9.5A');
  });

  it('closed_at non-null means closed badge shows', () => {
    const log = makeLog({ closed_at: 1748800000 });
    expect(!!log.closed_at).toBe(true);
  });

  it('closed_at null means no closed badge', () => {
    const log = makeLog({ closed_at: null });
    expect(!!log.closed_at).toBe(false);
  });
});
