<script lang="ts">
	import { offlineStore } from '$lib/stores/offline.svelte';
	import { APP_VERSION } from '$lib/version';

	const pendingCount = $derived(offlineStore.pendingCount);

	function formatDateTimeForCSV(timestamp: number): { date: string; time: string } {
		const d = new Date(timestamp);
		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		const hours = d.getHours();
		const minutes = String(d.getMinutes()).padStart(2, '0');
		const ampm = hours >= 12 ? 'PM' : 'AM';
		const displayHours = hours % 12 || 12;
		return {
			date: `${year}-${month}-${day}`,
			time: `${displayHours}:${minutes} ${ampm}`
		};
	}

	function generateJSON() {
		const entries = offlineStore.getAllQueuedLoads();
		const jobSites = Array.from(new Set(entries.map((e) => e.jobSiteId)));
		const totalTons = entries.reduce((sum, e) => sum + e.tons, 0);

		return {
			exportedAt: new Date().toISOString(),
			appVersion: APP_VERSION,
			entries,
			summary: {
				totalLoads: entries.length,
				totalTons,
				jobSites
			}
		};
	}

	function generateCSV() {
		const entries = offlineStore.getAllQueuedLoads();
		const header = 'Date,Time,JobSiteId,TicketNumber,Tons,Notes,Lane,Pass';
		const rows = entries.map((entry) => {
			const { date, time } = formatDateTimeForCSV(entry.timestamp);
			const ticket = entry.ticket_number ?? '';
			const notes = entry.notes?.replace(/"/g, '""') ?? '';
			const lane = entry.lane_number ?? '';
			const pass = entry.pass_number ?? '';
			return `${date},${time},${entry.jobSiteId},"${ticket}",${entry.tons},"${notes}",${lane},${pass}`;
		});
		return [header, ...rows].join('\n');
	}

	async function exportData(format: 'json' | 'csv') {
		const now = new Date();
		const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
		const filename = `paverate-export-${dateStr}.${format}`;

		let content: string;
		let mimeType: string;

		if (format === 'json') {
			content = JSON.stringify(generateJSON(), null, 2);
			mimeType = 'application/json';
		} else {
			content = generateCSV();
			mimeType = 'text/csv';
		}

		const blob = new Blob([content], { type: mimeType });
		const file = new File([blob], filename, { type: mimeType });

		// Try Web Share API first (mobile-friendly)
		if (navigator.share && navigator.canShare?.({ files: [file] })) {
			try {
				await navigator.share({
					files: [file],
					title: 'PaveRate Export',
					text: `Offline data export (${pendingCount} loads)`
				});
				return;
			} catch (err) {
				// User cancelled or share failed, fall back to download
			}
		}

		// Fallback: download link
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
</script>

{#if pendingCount > 0}
	<div class="export-button-group">
		<button class="export-button" onclick={() => exportData('json')} aria-label="Export as JSON">
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M3 12v2a2 2 0 002 2h6a2 2 0 002-2v-2" />
				<polyline points="8,15 8,3" />
				<polyline points="4,7 8,3 12,7" />
			</svg>
			Export {pendingCount} load{pendingCount === 1 ? '' : 's'}
		</button>
		<button class="export-button-small" onclick={() => exportData('csv')} aria-label="Export as CSV" title="Export as CSV">
			CSV
		</button>
	</div>
{/if}

<style>
	.export-button-group {
		display: flex;
		gap: 4px;
		width: 100%;
		max-width: 400px;
	}

	.export-button {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 48px;
		padding: 12px 16px;
		background: #f59e0b;
		color: #000;
		border: none;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s ease;
		touch-action: manipulation;
	}

	.export-button:hover {
		background: #d97706;
	}

	.export-button:active {
		background: #b45309;
	}

	.export-button-small {
		min-height: 48px;
		min-width: 48px;
		padding: 12px;
		background: #f59e0b;
		color: #000;
		border: none;
		border-radius: 8px;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s ease;
		touch-action: manipulation;
	}

	.export-button-small:hover {
		background: #d97706;
	}

	.export-button-small:active {
		background: #b45309;
	}
</style>
