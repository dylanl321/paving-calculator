<script lang="ts">
	import type { DbLoad } from '$lib/server/db';

	interface Props {
		jobSiteId: string;
		onLogged?: (load: DbLoad) => void;
		numLanes?: number | null;
		compact?: boolean;
	}

	let { jobSiteId, onLogged, numLanes = null, compact = false }: Props = $props();

	type Stage = 'idle' | 'reviewing' | 'saving' | 'done' | 'error';

	let stage = $state<Stage>('idle');
	let errorMsg = $state('');

	// Photo capture state
	let fileInputEl: HTMLInputElement;
	let imageUrl = $state<string | null>(null);
	let imageFile = $state<File | null>(null);

	// Form fields (user fills after seeing image)
	let ticketNumber = $state('');
	let tonsInput = $state('');
	let truckId = $state('');
	let mixType = $state('');
	let loadTime = $state('');
	let laneNumber = $state<number | null>(null);
	let passNumber = $state<number | null>(null);
	let notes = $state('');

	const MIX_TYPES = [
		'',
		'19mm Superpave',
		'12.5mm Superpave',
		'9.5mm Superpave',
		'Leveling Course',
		'Surface Course',
		'Other'
	];

	const MAX_LANES = $derived(numLanes ?? 4);
	const LANE_OPTIONS = $derived(Array.from({ length: MAX_LANES }, (_, i) => i + 1));
	const PASS_OPTIONS = [1, 2, 3, 4];

	function openCamera() {
		fileInputEl?.click();
	}

	function handleFile(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		imageFile = file;
		if (imageUrl) URL.revokeObjectURL(imageUrl);
		imageUrl = URL.createObjectURL(file);

		// Pre-fill time with current local time HH:MM
		const now = new Date();
		const hh = String(now.getHours()).padStart(2, '0');
		const mm = String(now.getMinutes()).padStart(2, '0');
		loadTime = `${hh}:${mm}`;

		stage = 'reviewing';
	}

	function cancel() {
		reset();
	}

	function reset() {
		stage = 'idle';
		errorMsg = '';
		ticketNumber = '';
		tonsInput = '';
		truckId = '';
		mixType = '';
		loadTime = '';
		laneNumber = null;
		passNumber = null;
		notes = '';
		imageFile = null;
		if (imageUrl) {
			URL.revokeObjectURL(imageUrl);
			imageUrl = null;
		}
		if (fileInputEl) fileInputEl.value = '';
	}

	async function logLoad() {
		const tons = parseFloat(tonsInput);
		if (!tonsInput || isNaN(tons) || tons <= 0) {
			errorMsg = 'Enter a valid weight in tons';
			return;
		}

		stage = 'saving';
		errorMsg = '';

		try {
			// Build timestamp from the loadTime field
			const now = new Date();
			let timestamp = Math.floor(now.getTime() / 1000);
			if (loadTime) {
				const [hh, mm] = loadTime.split(':').map(Number);
				if (!isNaN(hh) && !isNaN(mm)) {
					const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
					timestamp = Math.floor(d.getTime() / 1000);
				}
			}

			// Build notes: append truck_id and mix_type if provided
			let combinedNotes = notes.trim();
			const extras: string[] = [];
			if (truckId.trim()) extras.push(`Truck: ${truckId.trim()}`);
			if (mixType) extras.push(`Mix: ${mixType}`);
			if (extras.length > 0) {
				combinedNotes = combinedNotes ? `${combinedNotes} | ${extras.join(', ')}` : extras.join(', ');
			}

			const body: Record<string, unknown> = {
				tons,
				timestamp,
				ticket_number: ticketNumber.trim() || null,
				notes: combinedNotes || null,
				lane_number: laneNumber,
				pass_number: passNumber
			};

			const res = await fetch(`/api/job-sites/${jobSiteId}/loads`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error((data as { message?: string }).message || `Error ${res.status}`);
			}

			const data = await res.json();
			stage = 'done';
			onLogged?.(data.load);

			// If there's an image, upload it as a photo attachment linked to this load
			if (imageFile) {
				uploadTicketPhoto(data.load.id).catch((err) =>
					console.warn('Ticket photo upload failed (non-blocking):', err)
				);
			}

			setTimeout(reset, 1400);
		} catch (err: unknown) {
			stage = 'error';
			errorMsg = err instanceof Error ? err.message : 'Failed to log load';
		}
	}

	async function uploadTicketPhoto(loadId: string) {
		if (!imageFile) return;
		const formData = new FormData();
		formData.append('photo', imageFile);
		formData.append('caption', `Truck ticket #${ticketNumber || loadId}`);
		// Use load id as log_entry_id link (best-effort)
		await fetch(`/api/job-sites/${jobSiteId}/photos`, {
			method: 'POST',
			credentials: 'include',
			body: formData
		});
	}
</script>

<div class="ticket-capture" class:compact>
	<!-- Hidden file input -->
	<input
		type="file"
		accept="image/*"
		capture="environment"
		bind:this={fileInputEl}
		onchange={handleFile}
		style="display: none;"
	/>

	{#if stage === 'idle'}
		{#if compact}
			<button type="button" class="scan-btn-compact" onclick={openCamera} title="Scan Ticket">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<path d="M7 7h.01M7 12h.01M7 17h.01M12 7h5M12 12h5M12 17h5" />
				</svg>
			</button>
		{:else}
			<button type="button" class="scan-btn" onclick={openCamera}>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<path d="M7 7h.01M7 12h.01M7 17h.01M12 7h5M12 12h5M12 17h5" />
				</svg>
				<span>Scan Ticket</span>
			</button>
		{/if}
	{/if}
</div>

{#if stage === 'reviewing' || stage === 'saving' || stage === 'error' || stage === 'done'}
	<!-- Full-screen modal overlay -->
	<div class="modal-overlay" role="dialog" aria-modal="true" aria-label="Truck Ticket Entry">
		<div class="modal-inner">
			<!-- Ticket image -->
			{#if imageUrl}
				<div class="ticket-img-wrap">
					<img src={imageUrl} alt="Truck ticket" class="ticket-img" />
					<div class="img-hint">Read ticket and fill fields below</div>
				</div>
			{/if}

			<!-- Data entry form -->
			<div class="ticket-form">
				<h2 class="form-title">Log Ticket</h2>

				<div class="field-row">
					<label for="tc-ticket" class="field-label">Ticket #</label>
					<input
						id="tc-ticket"
						type="text"
						inputmode="numeric"
						bind:value={ticketNumber}
						placeholder="e.g. 48291"
						class="field-input"
						disabled={stage === 'saving' || stage === 'done'}
					/>
				</div>

				<div class="field-row required">
					<label for="tc-tons" class="field-label">Tons <span class="req-star">*</span></label>
					<input
						id="tc-tons"
						type="number"
						inputmode="decimal"
						min="0.1"
						step="0.01"
						bind:value={tonsInput}
						placeholder="e.g. 23.40"
						class="field-input"
						class:error={stage === 'error' && !tonsInput}
						disabled={stage === 'saving' || stage === 'done'}
					/>
				</div>

				<div class="field-row">
					<label for="tc-truck" class="field-label">Truck ID</label>
					<input
						id="tc-truck"
						type="text"
						bind:value={truckId}
						placeholder="e.g. T-14"
						class="field-input"
						disabled={stage === 'saving' || stage === 'done'}
					/>
				</div>

				<div class="field-row">
					<label for="tc-mix" class="field-label">Mix Type</label>
					<select
						id="tc-mix"
						bind:value={mixType}
						class="field-input"
						disabled={stage === 'saving' || stage === 'done'}
					>
						{#each MIX_TYPES as mt}
							<option value={mt}>{mt === '' ? '— Select —' : mt}</option>
						{/each}
					</select>
				</div>

				<div class="field-row">
					<label for="tc-time" class="field-label">Load Time</label>
					<input
						id="tc-time"
						type="time"
						bind:value={loadTime}
						class="field-input"
						disabled={stage === 'saving' || stage === 'done'}
					/>
				</div>

				<div class="two-col">
					<div class="field-row">
						<label for="tc-lane" class="field-label">Lane</label>
						<select
							id="tc-lane"
							bind:value={laneNumber}
							class="field-input"
							disabled={stage === 'saving' || stage === 'done'}
						>
							<option value={null}>—</option>
							{#each LANE_OPTIONS as ln}
								<option value={ln}>{ln}</option>
							{/each}
						</select>
					</div>
					<div class="field-row">
						<label for="tc-pass" class="field-label">Pass</label>
						<select
							id="tc-pass"
							bind:value={passNumber}
							class="field-input"
							disabled={stage === 'saving' || stage === 'done'}
						>
							<option value={null}>—</option>
							{#each PASS_OPTIONS as pn}
								<option value={pn}>{pn}</option>
							{/each}
						</select>
					</div>
				</div>

				<div class="field-row">
					<label for="tc-notes" class="field-label">Notes</label>
					<textarea
						id="tc-notes"
						bind:value={notes}
						placeholder="Optional notes..."
						class="field-input notes-area"
						rows="2"
						disabled={stage === 'saving' || stage === 'done'}
					></textarea>
				</div>

				{#if errorMsg}
					<div class="form-error">{errorMsg}</div>
				{/if}

				{#if stage === 'done'}
					<div class="form-success">
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
						Load logged!
					</div>
				{/if}

				<div class="form-actions">
					<button
						type="button"
						class="btn-cancel"
						onclick={cancel}
						disabled={stage === 'saving' || stage === 'done'}
					>
						Cancel
					</button>
					<button
						type="button"
						class="btn-log"
						onclick={logLoad}
						disabled={stage === 'saving' || stage === 'done'}
					>
						{#if stage === 'saving'}
							<svg
								class="spin"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M21 12a9 9 0 11-6.219-8.56" />
							</svg>
							Saving...
						{:else}
							Log Load
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.ticket-capture {
		width: 100%;
	}

	.ticket-capture.compact {
		width: auto;
		display: inline-block;
	}

	/* --- Scan button --- */
	.scan-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 48px;
		padding: 10px 16px;
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
		border: 1px solid var(--accent);
		border-radius: 8px;
		color: var(--accent);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.scan-btn:hover {
		background: color-mix(in srgb, var(--accent) 16%, var(--surface));
	}

	.scan-btn-compact {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		min-height: 48px;
		width: 48px;
		height: 48px;
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
		border: 1px solid var(--accent);
		border-radius: 8px;
		color: var(--accent);
		cursor: pointer;
		transition: background 0.15s;
		flex-shrink: 0;
	}

	.scan-btn-compact:hover {
		background: color-mix(in srgb, var(--accent) 16%, var(--surface));
	}

	/* --- Modal overlay --- */
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 9000;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		overflow-y: auto;
		padding: 0;
	}

	.modal-inner {
		width: 100%;
		max-width: 480px;
		background: var(--bg);
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	/* --- Ticket image --- */
	.ticket-img-wrap {
		background: #111;
		flex-shrink: 0;
		position: relative;
	}

	.ticket-img {
		width: 100%;
		max-height: 38vh;
		object-fit: contain;
		display: block;
	}

	.img-hint {
		text-align: center;
		font-size: 0.72rem;
		color: var(--text-muted);
		padding: 5px 12px;
		background: rgba(0, 0, 0, 0.4);
	}

	/* --- Form --- */
	.ticket-form {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		flex: 1;
	}

	.form-title {
		font-size: 1rem;
		font-weight: 700;
		color: var(--text);
		margin: 0 0 4px;
	}

	.field-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.field-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.req-star {
		color: var(--warn);
	}

	.field-input {
		width: 100%;
		min-height: 48px;
		padding: 10px 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text);
		font-size: 0.9375rem;
		box-sizing: border-box;
	}

	.field-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.field-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.field-input.error {
		border-color: var(--warn);
	}

	.notes-area {
		min-height: 64px;
		resize: vertical;
	}

	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}

	.form-error {
		font-size: 0.8125rem;
		color: var(--warn);
		background: color-mix(in srgb, var(--warn) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
		border-radius: 6px;
		padding: 8px 12px;
	}

	.form-success {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--good);
		background: color-mix(in srgb, var(--good) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--good) 30%, transparent);
		border-radius: 6px;
		padding: 10px 12px;
	}

	/* --- Actions --- */
	.form-actions {
		display: flex;
		gap: 10px;
		margin-top: 4px;
		padding-bottom: env(safe-area-inset-bottom, 8px);
	}

	.btn-cancel,
	.btn-log {
		flex: 1;
		min-height: 52px;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 700;
		cursor: pointer;
		border: none;
		transition:
			background 0.15s,
			filter 0.1s;
	}

	.btn-cancel {
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
	}

	.btn-cancel:hover:not(:disabled) {
		background: var(--surface-hover);
	}

	.btn-cancel:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-log {
		background: var(--accent);
		color: #1a1a1a;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.btn-log:hover:not(:disabled) {
		filter: brightness(1.08);
	}

	.btn-log:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.spin {
		animation: spin 0.9s linear infinite;
	}

	/* Landscape: side-by-side layout */
	@media (orientation: landscape) and (max-height: 500px) {
		.modal-inner {
			flex-direction: row;
			min-height: 100dvh;
		}

		.ticket-img-wrap {
			width: 45%;
			flex-shrink: 0;
		}

		.ticket-img {
			max-height: 100dvh;
			height: 100%;
		}

		.ticket-form {
			flex: 1;
			overflow-y: auto;
		}
	}
</style>
