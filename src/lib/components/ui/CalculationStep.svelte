<script lang="ts">
	interface Props {
		step: number;
		label: string;
		formula: string;
		result: string;
	}

	let { step, label, formula, result }: Props = $props();
</script>

<div class="calc-step">
	<div class="step-header">
		<span class="step-number">{step}</span>
		<span class="step-label">{label}</span>
	</div>
	<div class="step-body">
		<code class="step-formula">{formula}</code>
		<span class="step-equals">=</span>
		<span class="step-result">{result}</span>
	</div>
</div>

<style>
	.calc-step {
		padding: var(--sp-3) 0;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
	}
	.calc-step:last-child {
		border-bottom: none;
	}
	.step-header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-2);
	}
	.step-number {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-weight: var(--fw-bold);
		flex-shrink: 0;
	}
	.step-label {
		font-size: var(--fs-sm);
		color: var(--text);
		font-weight: var(--fw-medium);
	}
	.step-body {
		display: flex;
		align-items: baseline;
		gap: var(--sp-2);
		margin-left: 28px;
	}
	.step-formula {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: var(--fs-sm);
		color: var(--text);
		background: var(--surface);
		padding: 4px 8px;
		border-radius: 6px;
		white-space: nowrap;
	}
	.step-equals {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.step-result {
		font-size: var(--fs-sm);
		color: var(--accent);
		font-weight: var(--fw-bold);
		white-space: nowrap;
	}

	@media (max-width: 460px) {
		.step-body {
			flex-direction: column;
			gap: var(--sp-1);
			align-items: flex-start;
		}
		.step-equals {
			display: none;
		}
	}
</style>
