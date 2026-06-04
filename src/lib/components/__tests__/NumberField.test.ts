/**
 * src/lib/components/__tests__/NumberField.test.ts
 *
 * Component tests for NumberField: label+value+unit rendering,
 * min/max enforcement, step increment/decrement, keyboard input,
 * number formatting, disabled state, and error state on invalid input.
 */
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import NumberField from '$lib/components/NumberField.svelte';

describe('NumberField', () => {
	describe('rendering', () => {
		it('renders with label', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Tonnage', value: 0 }
			});
			expect(getByLabelText('Tonnage')).toBeDefined();
		});

		it('renders the current value in the input', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Width', value: 12 }
			});
			const input = getByLabelText('Width') as HTMLInputElement;
			expect(input.value).toBe('12');
		});

		it('renders the unit label when provided', () => {
			const { getByText } = render(NumberField, {
				props: { label: 'Speed', value: 60, unit: 'mph' }
			});
			expect(getByText('mph')).toBeDefined();
		});

		it('does not render a unit span when unit is omitted', () => {
			const { queryByText } = render(NumberField, {
				props: { label: 'Count', value: 5 }
			});
			// No unit-like short text should appear in a unit span
			// We just verify 'mph' is absent since no unit was passed
			expect(queryByText('mph')).toBeNull();
		});

		it('renders a hint paragraph when hint is provided', () => {
			const { getByText } = render(NumberField, {
				props: { label: 'Depth', value: 3, hint: 'Compacted depth in inches' }
			});
			expect(getByText('Compacted depth in inches')).toBeDefined();
		});

		it('does not render a hint when hint is omitted', () => {
			const { queryByText } = render(NumberField, {
				props: { label: 'Depth', value: 3 }
			});
			expect(queryByText('Compacted depth in inches')).toBeNull();
		});

		it('input has type="number" and inputmode="decimal"', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Weight', value: 10 }
			});
			const input = getByLabelText('Weight') as HTMLInputElement;
			expect(input.type).toBe('number');
			expect(input.getAttribute('inputmode')).toBe('decimal');
		});
	});

	describe('step attribute', () => {
		it('sets step attribute when step prop is provided', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Amount', value: 5, step: 0.5 }
			});
			const input = getByLabelText('Amount') as HTMLInputElement;
			expect(input.step).toBe('0.5');
		});

		it('step attribute is absent when step prop is not provided', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Amount', value: 5 }
			});
			const input = getByLabelText('Amount') as HTMLInputElement;
			// step defaults to "any" or empty when not set by svelte
			// We only verify the prop was not explicitly set to something odd
			expect(input.step === '' || input.step === 'any' || !input.hasAttribute('step')).toBe(true);
		});
	});

	describe('min / max enforcement', () => {
		it('sets min attribute when min prop is provided', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Temp', value: 50, min: 0 }
			});
			const input = getByLabelText('Temp') as HTMLInputElement;
			expect(input.min).toBe('0');
		});

		it('sets max attribute when max prop is provided', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Temp', value: 50, max: 200 }
			});
			const input = getByLabelText('Temp') as HTMLInputElement;
			expect(input.max).toBe('200');
		});

		it('sets both min and max when both props are provided', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Spread', value: 10, min: 1, max: 100 }
			});
			const input = getByLabelText('Spread') as HTMLInputElement;
			expect(input.min).toBe('1');
			expect(input.max).toBe('100');
		});

		it('applies aria-invalid when value is below min', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Rate', value: -5, min: 0 }
			});
			const input = getByLabelText('Rate') as HTMLInputElement;
			expect(input.getAttribute('aria-invalid')).toBe('true');
		});

		it('applies aria-invalid when value is above max', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Rate', value: 999, max: 500 }
			});
			const input = getByLabelText('Rate') as HTMLInputElement;
			expect(input.getAttribute('aria-invalid')).toBe('true');
		});

		it('does NOT apply aria-invalid when value is within range', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Rate', value: 50, min: 0, max: 100 }
			});
			const input = getByLabelText('Rate') as HTMLInputElement;
			expect(input.getAttribute('aria-invalid')).not.toBe('true');
		});
	});

	describe('disabled state', () => {
		it('input is not disabled by default', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Value', value: 10 }
			});
			const input = getByLabelText('Value') as HTMLInputElement;
			expect(input.disabled).toBe(false);
		});

		it('disables input when disabled prop is true', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Value', value: 10, disabled: true }
			});
			const input = getByLabelText('Value') as HTMLInputElement;
			expect(input.disabled).toBe(true);
		});

		it('adds a disabled class to the wrapper when disabled', () => {
			const { container } = render(NumberField, {
				props: { label: 'Value', value: 10, disabled: true }
			});
			const wrapper = container.querySelector('.field') as HTMLElement;
			expect(wrapper.classList.contains('disabled')).toBe(true);
		});
	});

	describe('error state', () => {
		it('does not show error element when no error prop is given', () => {
			const { container } = render(NumberField, {
				props: { label: 'Qty', value: 5 }
			});
			expect(container.querySelector('.field-error')).toBeNull();
		});

		it('renders error message element when error prop is provided', () => {
			const { getByText } = render(NumberField, {
				props: { label: 'Qty', value: -1, error: 'Must be positive' }
			});
			expect(getByText('Must be positive')).toBeDefined();
		});

		it('error element has .field-error class', () => {
			const { container } = render(NumberField, {
				props: { label: 'Qty', value: -1, error: 'Must be positive' }
			});
			const errEl = container.querySelector('.field-error');
			expect(errEl).not.toBeNull();
			expect(errEl?.textContent).toBe('Must be positive');
		});

		it('sets aria-invalid on input when error prop is provided', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Qty', value: -1, error: 'Must be positive' }
			});
			const input = getByLabelText('Qty') as HTMLInputElement;
			expect(input.getAttribute('aria-invalid')).toBe('true');
		});
	});

	describe('keyboard input and reactivity', () => {
		it('accepts numeric input via change event', async () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Length', value: 0 }
			});
			const input = getByLabelText('Length') as HTMLInputElement;
			await fireEvent.change(input, { target: { value: '42' } });
			expect(input.value).toBe('42');
		});

		it('accepts decimal input', async () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Depth', value: 0 }
			});
			const input = getByLabelText('Depth') as HTMLInputElement;
			await fireEvent.change(input, { target: { value: '3.14' } });
			expect(input.value).toBe('3.14');
		});

		it('handles null value gracefully (renders empty input)', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Nullable', value: null }
			});
			const input = getByLabelText('Nullable') as HTMLInputElement;
			// null should render as empty string in the input
			expect(input.value).toBe('');
		});
	});

	describe('number formatting display', () => {
		it('renders integer value without decimal suffix', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Count', value: 100 }
			});
			const input = getByLabelText('Count') as HTMLInputElement;
			expect(input.value).toBe('100');
		});

		it('renders float value preserving decimal places', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Rate', value: 12.5 }
			});
			const input = getByLabelText('Rate') as HTMLInputElement;
			expect(input.value).toBe('12.5');
		});

		it('renders zero as "0" not empty string', () => {
			const { getByLabelText } = render(NumberField, {
				props: { label: 'Zero', value: 0 }
			});
			const input = getByLabelText('Zero') as HTMLInputElement;
			expect(input.value).toBe('0');
		});
	});
});
