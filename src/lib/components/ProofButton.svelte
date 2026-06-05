<script lang="ts">
	import { job } from '$lib/stores/job.svelte';
	import { calcContext } from '$lib/stores/calcContext.svelte';

	async function handleExport() {
		try {
			// Dynamic import to avoid loading jsPDF until needed
			const { generateProofPDF } = await import('$lib/utils/pdf-export');

			const jobState = {
				siteName: job.siteName,
				siteDescription: job.siteDescription,
				courseType: calcContext.course_type.value,
				widthFt: calcContext.road_width.value,
				thicknessIn: calcContext.lift_thickness.value,
				machineId: job.machineId,
				firstPass: job.firstPass,
				truckLoadTons: job.truckLoadTons,
				tackApplication: job.tackApplication,
				wastePct: job.wastePct
			};

			await generateProofPDF(jobState);
		} catch (error) {
			console.error('Failed to generate PDF:', error);
			alert('Failed to generate PDF. Please try again.');
		}
	}
</script>

<button class="proof-btn" onclick={handleExport}>
	<svg
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
		<polyline points="14 2 14 8 20 8"></polyline>
		<line x1="16" y1="13" x2="8" y2="13"></line>
		<line x1="16" y1="17" x2="8" y2="17"></line>
		<polyline points="10 9 9 9 8 9"></polyline>
	</svg>
	Generate Proof
</button>

<style>
	.proof-btn {
		position: fixed;
		bottom: calc(20px + env(safe-area-inset-bottom));
		right: 20px;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 52px;
		padding: 0 20px;
		background: var(--accent);
		color: var(--accent-text);
		border: 0;
		border-radius: 26px;
		font-size: 0.95rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow:
			0 4px 12px rgba(0, 0, 0, 0.2),
			0 2px 4px rgba(0, 0, 0, 0.1);
		z-index: 100;
		transition:
			transform 0.2s,
			box-shadow 0.2s;
	}

	.proof-btn:hover {
		transform: translateY(-2px);
		box-shadow:
			0 6px 16px rgba(0, 0, 0, 0.25),
			0 4px 6px rgba(0, 0, 0, 0.15);
	}

	.proof-btn:active {
		transform: translateY(0);
	}

	@media (max-width: 600px) {
		.proof-btn {
			bottom: calc(16px + env(safe-area-inset-bottom));
			right: 16px;
			min-height: 48px;
			padding: 0 16px;
			font-size: 0.9rem;
		}
	}
</style>
