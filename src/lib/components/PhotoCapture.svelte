<script lang="ts">
	interface Props {
		jobSiteId: string;
		dailyLogId?: string;
		logEntryId?: string;
		onUploaded?: (photo: any) => void;
		compact?: boolean;
	}

	let {
		jobSiteId,
		dailyLogId,
		logEntryId,
		onUploaded,
		compact = false
	}: Props = $props();

	type CaptureState = 'idle' | 'selected' | 'uploading' | 'done' | 'error';

	interface PhotoUploadError {
		error?: string;
	}
	interface PhotoUploadResult {
		photo: unknown;
	}

	let state = $state<CaptureState>('idle');
	let selectedFile = $state<File | null>(null);
	let previewUrl = $state<string | null>(null);
	let caption = $state('');
	let errorMsg = $state('');
	let fileInputEl: HTMLInputElement;

	// GPS state
	let gpsLat = $state<number | null>(null);
	let gpsLng = $state<number | null>(null);
	let gpsAccuracy = $state<number | null>(null);
	let gpsStatus = $state<'idle' | 'acquiring' | 'acquired' | 'denied'>('idle');

	function openCamera() {
		fileInputEl?.click();
	}

	function handleFileSelected(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		selectedFile = file;
		previewUrl = URL.createObjectURL(file);
		caption = '';
		state = 'selected';
		errorMsg = '';

		// Try to get GPS position (best-effort, non-blocking)
		acquireGPS();
	}

	function acquireGPS() {
		if (!('geolocation' in navigator)) {
			gpsStatus = 'denied';
			return;
		}

		gpsStatus = 'acquiring';
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				gpsLat = pos.coords.latitude;
				gpsLng = pos.coords.longitude;
				gpsAccuracy = pos.coords.accuracy;
				gpsStatus = 'acquired';
			},
			(err) => {
				gpsStatus = 'denied';
				// Non-blocking: just log, don't prevent upload
				console.log('GPS not available:', err.message);
			},
			{
				enableHighAccuracy: true,
				maximumAge: 10_000,
				timeout: 12_000
			}
		);
	}

	async function upload() {
		if (!selectedFile) return;

		state = 'uploading';
		errorMsg = '';

		try {
			const formData = new FormData();
			formData.append('photo', selectedFile);
			if (caption) formData.append('caption', caption);
			if (gpsLat != null) formData.append('lat', gpsLat.toString());
			if (gpsLng != null) formData.append('lng', gpsLng.toString());
			if (gpsAccuracy != null) formData.append('gps_accuracy_m', gpsAccuracy.toString());
			if (dailyLogId) formData.append('daily_log_id', dailyLogId);
			if (logEntryId) formData.append('log_entry_id', logEntryId);

			const res = await fetch(`/api/job-sites/${jobSiteId}/photos`, {
				method: 'POST',
				body: formData
			});

			if (!res.ok) {
				const data = (await res.json()) as PhotoUploadError;
				throw new Error(data.error || 'Upload failed');
			}

			const data = (await res.json()) as PhotoUploadResult;
			state = 'done';
			onUploaded?.(data.photo);

			// Reset after a brief success display
			setTimeout(reset, 1500);
		} catch (err: any) {
			state = 'error';
			errorMsg = err.message || 'Upload failed';
		}
	}

	function reset() {
		state = 'idle';
		selectedFile = null;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
		caption = '';
		errorMsg = '';
		gpsLat = null;
		gpsLng = null;
		gpsAccuracy = null;
		gpsStatus = 'idle';
		if (fileInputEl) fileInputEl.value = '';
	}

	function cancel() {
		reset();
	}
</script>

<div class="photo-capture" class:compact>
	<input
		type="file"
		accept="image/*"
		capture="environment"
		bind:this={fileInputEl}
		onchange={handleFileSelected}
		style="display: none;"
	/>

	{#if state === 'idle'}
		{#if compact}
			<button type="button" class="photo-btn-compact" onclick={openCamera} title="Capture Photo">
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
					<path
						d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
					/>
					<circle cx="12" cy="13" r="4" />
				</svg>
			</button>
		{:else}
			<button type="button" class="photo-btn" onclick={openCamera}>
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
					<path
						d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
					/>
					<circle cx="12" cy="13" r="4" />
				</svg>
				<span>Capture Photo</span>
			</button>
		{/if}
	{:else if state === 'selected'}
		<div class="preview-card">
			{#if previewUrl}
				<img src={previewUrl} alt="Preview" class="preview-img" />
			{/if}
			<div class="preview-controls">
				<input
					type="text"
					bind:value={caption}
					placeholder="Caption (optional)"
					class="caption-input"
				/>
				{#if gpsStatus === 'acquiring'}
					<div class="gps-hint acquiring">Acquiring GPS...</div>
				{:else if gpsStatus === 'acquired'}
					<div class="gps-hint acquired">GPS acquired ({gpsAccuracy?.toFixed(0)}m accuracy)</div>
				{:else if gpsStatus === 'denied'}
					<div class="gps-hint denied">GPS unavailable - photo will upload without location</div>
				{/if}
				<div class="btn-group">
					<button type="button" class="btn-secondary" onclick={cancel}>Cancel</button>
					<button type="button" class="btn-primary" onclick={upload}>Upload</button>
				</div>
			</div>
		</div>
	{:else if state === 'uploading'}
		<div class="status-card uploading">
			<svg
				class="spin"
				width="24"
				height="24"
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
			<span>Uploading...</span>
		</div>
	{:else if state === 'done'}
		<div class="status-card done">
			<svg
				width="24"
				height="24"
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
			<span>Uploaded!</span>
		</div>
	{:else if state === 'error'}
		<div class="status-card error">
			<svg
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path
					d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
				/>
				<line x1="12" y1="9" x2="12" y2="13" />
				<line x1="12" y1="17" x2="12.01" y2="17" />
			</svg>
			<span>{errorMsg}</span>
			<button type="button" class="btn-secondary small" onclick={reset}>Try Again</button>
		</div>
	{/if}
</div>

<style>
	.photo-capture {
		width: 100%;
	}

	.photo-capture.compact {
		width: auto;
		display: inline-block;
	}

	.photo-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 48px;
		padding: 10px 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-muted);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
	}

	.photo-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.photo-btn-compact {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		min-height: 48px;
		width: 48px;
		height: 48px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
		flex-shrink: 0;
	}

	.photo-btn-compact:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.preview-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}

	.preview-img {
		width: 100%;
		height: 200px;
		object-fit: cover;
		display: block;
	}

	.preview-controls {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.caption-input {
		width: 100%;
		padding: 10px 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text);
		font-size: 0.875rem;
		min-height: 48px;
	}

	.caption-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.gps-hint {
		font-size: 0.75rem;
		padding: 6px 8px;
		border-radius: 4px;
		text-align: center;
	}

	.gps-hint.acquiring {
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}

	.gps-hint.acquired {
		color: var(--good);
		background: color-mix(in srgb, var(--good) 8%, transparent);
	}

	.gps-hint.denied {
		color: var(--text-muted);
		background: color-mix(in srgb, var(--text-muted) 8%, transparent);
	}

	.btn-group {
		display: flex;
		gap: 8px;
	}

	.btn-secondary,
	.btn-primary {
		flex: 1;
		min-height: 48px;
		padding: 10px 16px;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.15s,
			transform 0.1s;
		border: none;
	}

	.btn-secondary {
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
	}

	.btn-secondary:hover {
		background: var(--surface-hover);
	}

	.btn-primary {
		background: var(--accent);
		color: white;
	}

	.btn-primary:hover {
		filter: brightness(1.1);
	}

	.btn-secondary.small {
		flex: none;
		padding: 8px 16px;
		min-height: 40px;
		margin-top: 8px;
	}

	.status-card {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		min-height: 48px;
		padding: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		flex-direction: column;
	}

	.status-card.uploading {
		border-color: var(--accent);
		color: var(--accent);
	}

	.status-card.done {
		border-color: var(--good);
		color: var(--good);
	}

	.status-card.error {
		border-color: var(--warn);
		color: var(--warn);
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
		animation: spin 1s linear infinite;
	}
</style>
