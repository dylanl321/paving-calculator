<script lang="ts">
	interface Props {
		value?: string | null;
		id?: string;
		onchange?: () => void;
		disabled?: boolean;
	}
	let { value = $bindable(''), id, onchange, disabled = false }: Props = $props();

	function setNow() {
		const now = new Date();
		const hh = String(now.getHours()).padStart(2, '0');
		const mm = String(now.getMinutes()).padStart(2, '0');
		value = `${hh}:${mm}`;
		onchange?.();
	}
</script>

<div class="time-wrap">
	<input type="time" {id} bind:value onchange={onchange} disabled={disabled} />
	<button type="button" class="now-btn" onclick={setNow} disabled={disabled}>Now</button>
</div>

<style>
	.time-wrap {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		width: 100%;
	}
	.time-wrap input[type="time"] {
		flex: 1;
		min-height: var(--touch);
		padding: 0 var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: var(--fs-base);
		font-family: inherit;
	}
	.now-btn {
		min-height: var(--touch);
		padding: 0 var(--sp-3);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: var(--fs-sm);
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.now-btn:active {
		background: var(--accent);
		color: #000;
		border-color: var(--accent);
	}
</style>
