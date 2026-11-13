/**
 * The project header sets openCalculators when Calculators is clicked.
 * ProductionTab must open the in-project panel on that signal, including on
 * first mount (the Production tab is created in the same update).
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import ProductionTab from '../../../routes/dashboard/job-sites/[id]/_components/ProductionTab.svelte';

beforeAll(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: true,
			json: async () => ({ logs: [] })
		}))
	);
	if (!Element.prototype.scrollIntoView) {
		Element.prototype.scrollIntoView = () => {};
	}
});

afterEach(() => {
	cleanup();
});

const calculations: {
	id: string;
	calc_type: string;
	result: Record<string, number | undefined>;
	created_at: number;
}[] = [];

describe('ProductionTab calculator panel', () => {
	it('stays closed until asked', async () => {
		render(ProductionTab, {
			props: { jobSiteId: 'job-1', calculations, openCalculators: false }
		});
		await tick();
		expect(screen.queryByText('Calculating for this project')).toBeNull();
		expect(screen.getAllByRole('button', { name: 'Open calculators' }).length).toBeGreaterThan(0);
	});

	it('opens when openCalculators is set and tells the parent to clear the flag', async () => {
		const onCalculatorsOpened = vi.fn();
		render(ProductionTab, {
			props: {
				jobSiteId: 'job-1',
				calculations,
				openCalculators: true,
				onCalculatorsOpened
			}
		});
		await tick();
		expect(screen.getByText('Calculating for this project')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Hide calculators' })).toBeTruthy();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(onCalculatorsOpened).toHaveBeenCalledOnce();
	});
});
