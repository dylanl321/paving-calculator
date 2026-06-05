import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ProductionCheckCard from '../ProductionCheckCard.svelte';
import { calcContext } from '$lib/stores/calcContext.svelte';
import { logDraft } from '$lib/stores/logDraft.svelte';

describe('ProductionCheckCard', () => {
	afterEach(() => {
		cleanup();
		calcContext.clearAllManuals();
		logDraft.clearFor('production-check');
	});

	function seedContext() {
		calcContext.setManual('road_width', 12);
		calcContext.setManual('lift_thickness', 2);
		calcContext.setManual('course_type', 'TOLERANCE.INTERMEDIATE_WEARING');
	}

	it('prefills job context and calculates actual spread rate', async () => {
		seedContext();
		render(ProductionCheckCard);

		expect(screen.getByText('Actual Spread')).toBeTruthy();
		expect(screen.getByText('Target')).toBeTruthy();
		expect(screen.getAllByText('220').length).toBeGreaterThan(0);

		await fireEvent.input(screen.getByLabelText('Tons placed'), { target: { value: '22' } });
		await fireEvent.input(screen.getByLabelText('Distance paved'), { target: { value: '150' } });

		await waitFor(() => {
			expect(logDraft.current?.toolId).toBe('production-check');
			expect(logDraft.current?.fields.tons_placed).toBe(22);
			expect(logDraft.current?.fields.distance_ft).toBe(150);
			expect(logDraft.current?.fields.spread_rate_actual).toBe(220);
		});
	});

	it('calculates reachable feet from available tons', async () => {
		seedContext();
		render(ProductionCheckCard);

		await fireEvent.input(screen.getByLabelText('Available tons'), { target: { value: '40' } });

		await waitFor(() => {
			expect(screen.getByText('273')).toBeTruthy();
			expect(logDraft.current?.summary).toContain('273 ft');
		});
	});
});
