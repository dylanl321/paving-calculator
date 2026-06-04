/**
 * src/lib/components/__tests__/CalcCard.test.ts
 *
 * Component tests for CalcCard, ResultStat, and ShowWork.
 *
 * CalcCard: renders title/purpose, hideTitle toggle, children slot.
 * ResultStat: value display, unit, badge colours, secondary text, empty state.
 * ShowWork: toggle expand/collapse, stepCount badge, aria-expanded state.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Svelte 5 snippets cannot be created directly in tests, so for components
 * that need a `children` snippet we use a thin wrapper .svelte file.
 * To avoid needing extra wrapper files we instead test CalcCard/ShowWork
 * by checking what IS rendered (the structural elements around children)
 * and verifying interactivity, while rendering them with a snippet via a
 * dedicated thin wrapper defined below using the component test API.
 */

// ─── CalcCard ───────────────────────────────────────────────────────────────

import CalcCard from '$lib/components/CalcCard.svelte';
import ResultStat from '$lib/components/ResultStat.svelte';
import ShowWork from '$lib/components/ShowWork.svelte';

// We need a wrapper to pass children snippet to CalcCard / ShowWork.
// @testing-library/svelte accepts a `slots` option (legacy Svelte 4 API)
// but Svelte 5 uses snippets.  We use the `props` option with a
// `children` snippet created via the `createRawSnippet` helper exported by
// Svelte itself.
import { createRawSnippet } from 'svelte';

// Helper: build a snippet that renders a single <span> with text.
function textSnippet(text: string) {
	return createRawSnippet(() => ({
		render: () => `<span>${text}</span>`,
		setup: () => {}
	}));
}

// Ensure DOM is cleaned up between each test to avoid element pollution
afterEach(() => cleanup());

// ────────────────────────────────────────────────────────────────────────────

describe('CalcCard', () => {
	it('renders the title in an h2 by default', () => {
		const { container } = render(CalcCard, {
			props: {
				title: 'Material Calculator',
				purpose: 'Estimate asphalt tonnage',
				children: textSnippet('content')
			}
		});
		const h2 = container.querySelector('h2');
		expect(h2).not.toBeNull();
		expect(h2?.textContent).toBe('Material Calculator');
	});

	it('renders the purpose/description text', () => {
		render(CalcCard, {
			props: {
				title: 'Spread Rate',
				purpose: 'Lbs per square yard',
				children: textSnippet('inner')
			}
		});
		expect(screen.getByText('Lbs per square yard')).toBeDefined();
	});

	it('hides title h2 when hideTitle=true', () => {
		const { container } = render(CalcCard, {
			props: {
				title: 'Hidden Title',
				purpose: 'Still shows purpose',
				hideTitle: true,
				children: textSnippet('inner')
			}
		});
		const h2 = container.querySelector('h2');
		expect(h2).toBeNull();
		// Purpose is still shown
		expect(screen.getByText('Still shows purpose')).toBeDefined();
	});

	it('shows title h2 when hideTitle=false (default)', () => {
		const { container } = render(CalcCard, {
			props: {
				title: 'Visible Title',
				purpose: 'desc',
				hideTitle: false,
				children: textSnippet('inner')
			}
		});
		const h2 = container.querySelector('h2');
		expect(h2?.textContent).toBe('Visible Title');
	});

	it('renders children content inside the card', () => {
		render(CalcCard, {
			props: {
				title: 'Card',
				purpose: 'desc',
				children: textSnippet('child-content')
			}
		});
		expect(screen.getByText('child-content')).toBeDefined();
	});

	it('wraps content in a section.calc-card element', () => {
		const { container } = render(CalcCard, {
			props: {
				title: 'T',
				purpose: 'P',
				children: textSnippet('x')
			}
		});
		const section = container.querySelector('section.calc-card');
		expect(section).not.toBeNull();
	});
});

// ────────────────────────────────────────────────────────────────────────────

describe('ResultStat', () => {
	it('shows placeholder text when value is null', () => {
		render(ResultStat, { props: { value: null, unit: 'tons' } });
		expect(screen.getByText('Enter values above to see the result')).toBeDefined();
	});

	it('does not show placeholder when value is provided', () => {
		render(ResultStat, { props: { value: '42.5', unit: 'tons' } });
		expect(screen.queryByText('Enter values above to see the result')).toBeNull();
	});

	it('renders a string value', () => {
		render(ResultStat, { props: { value: '123.4', unit: 'tons' } });
		expect(screen.getByText('123.4')).toBeDefined();
	});

	it('renders a numeric value', () => {
		render(ResultStat, { props: { value: 99, unit: 'lbs/sy' } });
		expect(screen.getByText('99')).toBeDefined();
	});

	it('renders the unit label', () => {
		render(ResultStat, { props: { value: '10', unit: 'cubic yards' } });
		expect(screen.getByText('cubic yards')).toBeDefined();
	});

	it('renders secondary text when provided', () => {
		render(ResultStat, {
			props: { value: '10', unit: 'tons', secondary: '≈ 5 truck loads' }
		});
		expect(screen.getByText('≈ 5 truck loads')).toBeDefined();
	});

	it('does not render secondary when not provided', () => {
		const { container } = render(ResultStat, {
			props: { value: '10', unit: 'tons' }
		});
		expect(container.querySelector('.secondary')).toBeNull();
	});

	it('renders a good badge', () => {
		const { container } = render(ResultStat, {
			props: {
				value: '10',
				unit: 'tons',
				badge: { kind: 'good', text: 'On target' }
			}
		});
		const badge = container.querySelector('.badge.good');
		expect(badge).not.toBeNull();
		expect(badge?.textContent).toBe('On target');
	});

	it('renders a warn badge', () => {
		const { container } = render(ResultStat, {
			props: {
				value: '10',
				unit: 'tons',
				badge: { kind: 'warn', text: 'Near limit' }
			}
		});
		const badge = container.querySelector('.badge.warn');
		expect(badge).not.toBeNull();
		expect(badge?.textContent).toBe('Near limit');
	});

	it('renders a bad badge', () => {
		const { container } = render(ResultStat, {
			props: {
				value: '10',
				unit: 'tons',
				badge: { kind: 'bad', text: 'Over limit' }
			}
		});
		const badge = container.querySelector('.badge.bad');
		expect(badge).not.toBeNull();
		expect(badge?.textContent).toBe('Over limit');
	});

	it('does not render a badge when badge=null', () => {
		const { container } = render(ResultStat, {
			props: { value: '10', unit: 'tons', badge: null }
		});
		expect(container.querySelector('.badge')).toBeNull();
	});

	it('adds empty class when value is null', () => {
		const { container } = render(ResultStat, {
			props: { value: null, unit: 'tons' }
		});
		const result = container.querySelector('.result');
		expect(result?.classList.contains('empty')).toBe(true);
	});

	it('does not add empty class when value is provided', () => {
		const { container } = render(ResultStat, {
			props: { value: '5', unit: 'tons' }
		});
		const result = container.querySelector('.result');
		expect(result?.classList.contains('empty')).toBe(false);
	});
});

// ────────────────────────────────────────────────────────────────────────────

describe('ShowWork', () => {
	it('renders the toggle button with "Show the math" text', () => {
		render(ShowWork, {
			props: { children: textSnippet('step content') }
		});
		const button = screen.getByRole('button', { name: /show the math/i });
		expect(button).toBeDefined();
	});

	it('starts collapsed (aria-expanded=false)', () => {
		render(ShowWork, {
			props: { children: textSnippet('step content') }
		});
		const button = screen.getByRole('button', { name: /show the math/i });
		expect(button.getAttribute('aria-expanded')).toBe('false');
	});

	it('does not show children content when collapsed', () => {
		render(ShowWork, {
			props: { children: textSnippet('hidden-step') }
		});
		expect(screen.queryByText('hidden-step')).toBeNull();
	});

	it('expands to show children when toggle is clicked', async () => {
		render(ShowWork, {
			props: { children: textSnippet('expanded-step') }
		});
		const button = screen.getByRole('button', { name: /show the math/i });
		await fireEvent.click(button);
		await tick();
		expect(screen.getByText('expanded-step')).toBeDefined();
	});

	it('sets aria-expanded=true after expanding', async () => {
		render(ShowWork, {
			props: { children: textSnippet('step') }
		});
		const button = screen.getByRole('button', { name: /show the math/i });
		await fireEvent.click(button);
		await tick();
		expect(button.getAttribute('aria-expanded')).toBe('true');
	});

	it('collapses again on second click (aria-expanded returns to false)', async () => {
		render(ShowWork, {
			props: { children: textSnippet('collapsible-step') }
		});
		const button = screen.getByRole('button', { name: /show the math/i });
		// expand
		await fireEvent.click(button);
		await tick();
		await tick();
		expect(button.getAttribute('aria-expanded')).toBe('true');
		// collapse
		await fireEvent.click(button);
		await tick();
		await tick();
		// state is back to closed
		expect(button.getAttribute('aria-expanded')).toBe('false');
	});

	it('shows stepCount badge when stepCount > 0', () => {
		const { container } = render(ShowWork, {
			props: { children: textSnippet('step'), stepCount: 4 }
		});
		const badge = container.querySelector('.step-badge');
		expect(badge).not.toBeNull();
		expect(badge?.textContent).toBe('4');
	});

	it('does not show stepCount badge when stepCount is 0', () => {
		const { container } = render(ShowWork, {
			props: { children: textSnippet('step'), stepCount: 0 }
		});
		expect(container.querySelector('.step-badge')).toBeNull();
	});

	it('does not show stepCount badge when stepCount is undefined', () => {
		const { container } = render(ShowWork, {
			props: { children: textSnippet('step') }
		});
		expect(container.querySelector('.step-badge')).toBeNull();
	});

	it('does not render inspector button when inspectorStats not provided', () => {
		render(ShowWork, {
			props: { children: textSnippet('step') }
		});
		expect(screen.queryByText(/show to inspector/i)).toBeNull();
	});

	it('renders inspector button when inspectorStats and inspectorTitle provided', () => {
		render(ShowWork, {
			props: {
				children: textSnippet('step'),
				inspectorStats: [{ label: 'Temp', value: '72', unit: 'F' }],
				inspectorTitle: 'Job Stats'
			}
		});
		expect(screen.getByText(/show to inspector/i)).toBeDefined();
	});

	it('toggle button chevron changes direction when expanded', async () => {
		render(ShowWork, {
			props: { children: textSnippet('step') }
		});
		const button = screen.getByRole('button', { name: /show the math/i });
		// collapsed: right-pointing triangle
		expect(button.textContent).toContain('▸');
		await fireEvent.click(button);
		await tick();
		// expanded: down-pointing triangle
		expect(button.textContent).toContain('▾');
	});
});
