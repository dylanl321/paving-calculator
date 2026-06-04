/**
 * src/lib/components/__tests__/SpreadRateCard.test.ts
 *
 * Tests for SpreadRateGauge — the gauge visualization used inside SpreadRateCard.
 * Covers:
 *   - needle renders at the correct position for a given spread rate
 *   - threshold coloring: good (green) / warn (yellow) / bad (red)
 *   - readout displays actual and target values
 *   - GDOT Table 12 tolerance values drive the correct thresholds
 *   - edge cases: 0 rate, extremely high rate, null values
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import SpreadRateGauge from '$lib/components/SpreadRateGauge.svelte';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the numeric percentage from a CSS left value like "50%".
 * Returns NaN if not found.
 */
function needlePercent(container: HTMLElement): number {
  const needle = container.querySelector('.needle-marker') as HTMLElement | null;
  if (!needle) return NaN;
  const left = needle.style.left;
  return parseFloat(left);
}

/**
 * Return the background style of the needle marker.
 */
function needleBackground(container: HTMLElement): string {
  const needle = container.querySelector('.needle-marker') as HTMLElement | null;
  if (!needle) return '';
  return needle.style.background;
}

// ── percentage / position tests ───────────────────────────────────────────────

describe('SpreadRateGauge: needle position', () => {
  it('needle is at 50% when actual equals target (on-target)', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 200, target: 200, toleranceLbsSy: 27.5 }
    });
    expect(needlePercent(container)).toBeCloseTo(50, 1);
  });

  it('needle is above 50% when actual is higher than target', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 230, target: 200, toleranceLbsSy: 27.5 }
    });
    expect(needlePercent(container)).toBeGreaterThan(50);
  });

  it('needle is below 50% when actual is lower than target', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 170, target: 200, toleranceLbsSy: 27.5 }
    });
    expect(needlePercent(container)).toBeLessThan(50);
  });

  it('needle moves proportionally: +1x tolerance offset should be ~16.67% above 50%', () => {
    // span = tol * 3 = 82.5; actual - target = 27.5 => (27.5/82.5 + 1) / 2 = ~0.667
    const tol = 27.5;
    const { container } = render(SpreadRateGauge, {
      props: { actual: 200 + tol, target: 200, toleranceLbsSy: tol }
    });
    const expected = ((tol / (tol * 3) + 1) / 2) * 100; // ~66.67
    expect(needlePercent(container)).toBeCloseTo(expected, 1);
  });

  it('needle clamps at 100% when actual is extremely high (far above target)', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 10000, target: 200, toleranceLbsSy: 27.5 }
    });
    expect(needlePercent(container)).toBe(100);
  });

  it('needle clamps at 0% when actual is extremely low (far below target)', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 1, target: 10000, toleranceLbsSy: 27.5 }
    });
    expect(needlePercent(container)).toBe(0);
  });

  it('no needle-marker rendered when actual is null', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: null, target: 200, toleranceLbsSy: 27.5 }
    });
    expect(container.querySelector('.needle-marker')).toBeNull();
  });

  it('no needle-marker rendered when target is null', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 200, target: null, toleranceLbsSy: 27.5 }
    });
    expect(container.querySelector('.needle-marker')).toBeNull();
  });

  it('no needle-marker rendered when both are null', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: null, target: null, toleranceLbsSy: 27.5 }
    });
    expect(container.querySelector('.needle-marker')).toBeNull();
  });
});

// ── threshold coloring tests ──────────────────────────────────────────────────

describe('SpreadRateGauge: threshold coloring', () => {
  // GDOT Table 12 intermediate/wearing tolerance: 27.5 lbs/SY
  const tol = 27.5;
  const target = 200;

  it('color is var(--good) when actual is within tolerance (in spec)', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: target + tol, target, toleranceLbsSy: tol }
    });
    expect(needleBackground(container)).toBe('var(--good)');
  });

  it('color is var(--good) when actual is exactly at target', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: target, target, toleranceLbsSy: tol }
    });
    expect(needleBackground(container)).toBe('var(--good)');
  });

  it('color is var(--good) when actual is at negative tolerance boundary', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: target - tol, target, toleranceLbsSy: tol }
    });
    expect(needleBackground(container)).toBe('var(--good)');
  });

  it('color is var(--warn) when actual is between 1x and 1.5x tolerance (warning zone)', () => {
    // 1.2x tolerance: beyond good (1x) but within warn (1.5x)
    const { container } = render(SpreadRateGauge, {
      props: { actual: target + tol * 1.2, target, toleranceLbsSy: tol }
    });
    expect(needleBackground(container)).toBe('var(--warn)');
  });

  it('color is var(--warn) for negative 1.25x tolerance offset', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: target - tol * 1.25, target, toleranceLbsSy: tol }
    });
    expect(needleBackground(container)).toBe('var(--warn)');
  });

  it('color is var(--bad) when actual exceeds 1.5x tolerance (out of spec)', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: target + tol * 2, target, toleranceLbsSy: tol }
    });
    expect(needleBackground(container)).toBe('var(--bad)');
  });

  it('color is var(--bad) when actual is far below target (extreme low)', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: target - tol * 3, target, toleranceLbsSy: tol }
    });
    expect(needleBackground(container)).toBe('var(--bad)');
  });
});

// ── GDOT Table 12 tolerance values ────────────────────────────────────────────

describe('SpreadRateGauge: GDOT Table 12 tolerance boundaries', () => {
  // These values come directly from paverate.yaml spreadTolerance entries.
  const GDOT_TOLERANCES = [
    { label: 'Base course', tol: 55 },
    { label: 'Intermediate / wearing course', tol: 27.5 },
    { label: 'OGFC', tol: 7 },
    { label: 'PEM', tol: 10 }
  ] as const;

  for (const { label, tol } of GDOT_TOLERANCES) {
    it(`[${label}] in-spec at exactly ±${tol} lbs/SY`, () => {
      const target = 300;
      const { container: c1 } = render(SpreadRateGauge, {
        props: { actual: target + tol, target, toleranceLbsSy: tol }
      });
      expect(needleBackground(c1)).toBe('var(--good)');

      const { container: c2 } = render(SpreadRateGauge, {
        props: { actual: target - tol, target, toleranceLbsSy: tol }
      });
      expect(needleBackground(c2)).toBe('var(--good)');
    });

    it(`[${label}] warn zone at ${tol * 1.25} lbs/SY (1.25x tolerance)`, () => {
      const target = 300;
      const { container } = render(SpreadRateGauge, {
        props: { actual: target + tol * 1.25, target, toleranceLbsSy: tol }
      });
      expect(needleBackground(container)).toBe('var(--warn)');
    });

    it(`[${label}] out-of-spec at ${tol * 2} lbs/SY (2x tolerance)`, () => {
      const target = 300;
      const { container } = render(SpreadRateGauge, {
        props: { actual: target + tol * 2, target, toleranceLbsSy: tol }
      });
      expect(needleBackground(container)).toBe('var(--bad)');
    });
  }
});

// ── readout display tests ────────────────────────────────────────────────────

describe('SpreadRateGauge: readout display', () => {
  it('shows actual and target values in readout area', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 215, target: 200, toleranceLbsSy: 27.5 }
    });
    const values = container.querySelectorAll('.readout-value');
    const texts = Array.from(values).map((el) => el.textContent?.trim() ?? '');
    expect(texts.some((t) => t.includes('215'))).toBe(true);
    expect(texts.some((t) => t.includes('200'))).toBe(true);
  });

  it('shows em-dash for actual when null', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: null, target: 200, toleranceLbsSy: 27.5 }
    });
    const values = container.querySelectorAll('.readout-value');
    const texts = Array.from(values).map((el) => el.textContent?.trim() ?? '');
    expect(texts.some((t) => t.includes('\u2014'))).toBe(true);
  });

  it('shows em-dash for target when null', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 200, target: null, toleranceLbsSy: 27.5 }
    });
    const values = container.querySelectorAll('.readout-value');
    const texts = Array.from(values).map((el) => el.textContent?.trim() ?? '');
    expect(texts.some((t) => t.includes('\u2014'))).toBe(true);
  });

  it('rounds actual to nearest integer in readout', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 214.7, target: 200, toleranceLbsSy: 27.5 }
    });
    const values = container.querySelectorAll('.readout-value');
    const texts = Array.from(values).map((el) => el.textContent?.trim() ?? '');
    expect(texts.some((t) => t.includes('215'))).toBe(true);
  });

  it('renders zone labels: Low, Target, High', () => {
    const { getAllByText } = render(SpreadRateGauge, {
      props: { actual: 200, target: 200, toleranceLbsSy: 27.5 }
    });
    // Labels appear in the SVG gauge-dial (may be duplicated across mobile/desktop variants)
    expect(getAllByText('Low').length).toBeGreaterThan(0);
    expect(getAllByText('Target').length).toBeGreaterThan(0);
    expect(getAllByText('High').length).toBeGreaterThan(0);
  });
});

// ── edge cases ───────────────────────────────────────────────────────────────

describe('SpreadRateGauge: edge cases', () => {
  it('handles actual rate of 0 without throwing', () => {
    expect(() =>
      render(SpreadRateGauge, {
        props: { actual: 0, target: 200, toleranceLbsSy: 27.5 }
      })
    ).not.toThrow();
  });

  it('needle clamps to 0% when actual is 0 and target is high', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 0, target: 200, toleranceLbsSy: 27.5 }
    });
    expect(needlePercent(container)).toBe(0);
  });

  it('actual=0 with target=0 shows needle at 50% (both on target)', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 0, target: 0, toleranceLbsSy: 27.5 }
    });
    // actual == target => delta == 0 => 50%
    expect(needlePercent(container)).toBeCloseTo(50, 1);
  });

  it('handles extremely high actual rate without throwing', () => {
    expect(() =>
      render(SpreadRateGauge, {
        props: { actual: 999999, target: 200, toleranceLbsSy: 27.5 }
      })
    ).not.toThrow();
  });

  it('extremely high actual rate clamps needle at 100%', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 999999, target: 200, toleranceLbsSy: 27.5 }
    });
    expect(needlePercent(container)).toBe(100);
  });

  it('extremely high actual shows bad (red) coloring', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 999999, target: 200, toleranceLbsSy: 27.5 }
    });
    expect(needleBackground(container)).toBe('var(--bad)');
  });

  it('renders without errors when toleranceLbsSy is very small (OGFC: 7)', () => {
    expect(() =>
      render(SpreadRateGauge, {
        props: { actual: 200, target: 200, toleranceLbsSy: 7 }
      })
    ).not.toThrow();
  });

  it('renders without errors when toleranceLbsSy is large (Base: 55)', () => {
    expect(() =>
      render(SpreadRateGauge, {
        props: { actual: 300, target: 300, toleranceLbsSy: 55 }
      })
    ).not.toThrow();
  });

  it('gauge-bar element is always present in the DOM', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: 200, target: 200, toleranceLbsSy: 27.5 }
    });
    expect(container.querySelector('.gauge-bar')).not.toBeNull();
  });

  it('gauge-wrapper is always present in the DOM', () => {
    const { container } = render(SpreadRateGauge, {
      props: { actual: null, target: null, toleranceLbsSy: 27.5 }
    });
    expect(container.querySelector('.gauge-wrapper')).not.toBeNull();
  });
});
