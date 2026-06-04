<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';
	import { api } from '$lib/utils/api-error';
	import type { EmailReportSchedule } from './shared';

	let { initialSchedules }: { initialSchedules: EmailReportSchedule[] } = $props();

	let schedules = $state<EmailReportSchedule[]>(initialSchedules ?? []);
	let showAddForm = $state(false);
	let saving = $state(false);
	let message = $state('');
	let messageType = $state<'ok' | 'error'>('ok');

	let formReportType = $state<string>('daily_summary');
	let formSendHour = $state<number>(8);
	let formDayOfWeek = $state<number>(1);
	let formRecipients = $state<string>('');
	let formEnabled = $state<boolean>(true);

	const reportTypeLabels: Record<string, string> = {
		daily_summary: 'Daily Summary',
		weekly_rollup: 'Weekly Rollup',
		monthly_rollup: 'Monthly Rollup'
	};

	const frequencyLabels: Record<string, string> = {
		daily: 'Daily',
		weekly: 'Weekly',
		monthly: 'Monthly'
	};

	const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	const hourOptions = [
		{ value: 6, label: '6:00 AM' },
		{ value: 7, label: '7:00 AM' },
		{ value: 8, label: '8:00 AM' },
		{ value: 9, label: '9:00 AM' },
		{ value: 10, label: '10:00 AM' },
		{ value: 11, label: '11:00 AM' },
		{ value: 12, label: '12:00 PM' },
		{ value: 13, label: '1:00 PM' },
		{ value: 14, label: '2:00 PM' },
		{ value: 15, label: '3:00 PM' },
		{ value: 16, label: '4:00 PM' },
		{ value: 17, label: '5:00 PM' },
		{ value: 18, label: '6:00 PM' }
	];

	function resetForm() {
		formReportType = 'daily_summary';
		formSendHour = 8;
		formDayOfWeek = 1;
		formRecipients = '';
		formEnabled = true;
		showAddForm = false;
	}

	async function loadSchedules() {
		try {
			const data = await api.get<{ schedules: EmailReportSchedule[] }>('/api/org/email-report-schedules');
			schedules = data.schedules;
		} catch (e) {
			console.error('Failed to load schedules:', e);
		}
	}

	async function saveSchedule() {
		saving = true;
		message = '';
		try {
			const recipients = formRecipients
				.split(/[\n,]+/)
				.map((e) => e.trim())
				.filter(Boolean);

			if (recipients.length === 0 || recipients.length > 10) {
				message = 'Please enter 1-10 email addresses';
				messageType = 'error';
				saving = false;
				return;
			}

			const frequency =
				formReportType === 'daily_summary'
					? 'daily'
					: formReportType === 'weekly_rollup'
						? 'weekly'
						: 'monthly';

			await api.post('/api/org/email-report-schedules', {
				reportType: formReportType,
				frequency,
				sendHour: formSendHour,
				dayOfWeek: frequency === 'weekly' ? formDayOfWeek : null,
				recipients,
				enabled: formEnabled
			});

			message = 'Schedule saved successfully';
			messageType = 'ok';
			toastStore.success('Schedule saved successfully');
			resetForm();
			await loadSchedules();
		} catch (e) {
			message = 'Network error';
			messageType = 'error';
		} finally {
			saving = false;
		}
	}

	async function toggleSchedule(schedule: EmailReportSchedule) {
		try {
			await api.post('/api/org/email-report-schedules', {
				id: schedule.id,
				reportType: schedule.reportType,
				frequency: schedule.frequency,
				sendHour: schedule.sendHour,
				dayOfWeek: schedule.dayOfWeek,
				recipients: schedule.recipients,
				enabled: !schedule.enabled
			});
			await loadSchedules();
			toastStore.success('Schedule updated');
		} catch (e) {
			console.error('Failed to toggle schedule:', e);
		}
	}

	async function deleteSchedule(schedule: EmailReportSchedule) {
		if (!confirm('Delete this scheduled report?')) return;
		try {
			await api.delete(`/api/org/email-report-schedules?id=${schedule.id}`);
			await loadSchedules();
			toastStore.success('Schedule deleted');
		} catch (e) {
			console.error('Failed to delete schedule:', e);
		}
	}

	function formatLastSent(ts: number | null): string {
		if (!ts) return 'Never';
		const date = new Date(ts * 1000);
		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<section class="card">
	<h3>Scheduled Report Emails</h3>
	<p class="card-desc">
		Automatically send paving reports to stakeholders via email on a schedule.
	</p>

	{#if schedules.length > 0}
		<div class="schedules-list">
			{#each schedules as schedule (schedule.id)}
				<div class="schedule-item">
					<div class="schedule-header">
						<div class="schedule-type">
							<span class="type-badge">{reportTypeLabels[schedule.reportType]}</span>
							<span class="frequency-label">{frequencyLabels[schedule.frequency]}</span>
							{#if schedule.frequency === 'weekly' && schedule.dayOfWeek !== null}
								<span class="day-label">on {dayLabels[schedule.dayOfWeek]}</span>
							{/if}
						</div>
						<div class="schedule-actions">
							<label class="toggle-switch">
								<input
									type="checkbox"
									checked={schedule.enabled}
									onchange={() => toggleSchedule(schedule)}
								/>
								<span class="toggle-slider"></span>
							</label>
							<button
								class="delete-btn"
								onclick={() => deleteSchedule(schedule)}
								aria-label="Delete schedule"
							>
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
									/>
								</svg>
							</button>
						</div>
					</div>
					<div class="schedule-details">
						<div class="detail-row">
							<span class="detail-label">Recipients:</span>
							<span class="recipients">
								{#each schedule.recipients.slice(0, 3) as email, i}
									{email}{i < schedule.recipients.slice(0, 3).length - 1 ? ', ' : ''}
								{/each}
								{#if schedule.recipients.length > 3}
									<span class="more-recipients">+{schedule.recipients.length - 3} more</span>
								{/if}
							</span>
						</div>
						<div class="detail-row">
							<span class="detail-label">Last sent:</span>
							<span class="last-sent">{formatLastSent(schedule.lastSentAt)}</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if showAddForm}
		<div class="add-form">
			<h4>Add Schedule</h4>
			<div class="form-group">
				<label for="reportType">Report Type</label>
				<select id="reportType" bind:value={formReportType}>
					<option value="daily_summary">Daily Summary</option>
					<option value="weekly_rollup">Weekly Rollup</option>
					<option value="monthly_rollup">Monthly Rollup</option>
				</select>
			</div>

			<div class="form-group">
				<label for="sendHour">Send Time (UTC)</label>
				<select id="sendHour" bind:value={formSendHour}>
					{#each hourOptions as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>

			{#if formReportType === 'weekly_rollup'}
				<div class="form-group">
					<label for="dayOfWeek">Day of Week</label>
					<select id="dayOfWeek" bind:value={formDayOfWeek}>
						{#each dayLabels as day, i}
							<option value={i}>{day}</option>
						{/each}
					</select>
				</div>
			{/if}

			<div class="form-group">
				<label for="recipients"
					>Recipients (comma or newline separated, max 10)</label
				>
				<textarea
					id="recipients"
					bind:value={formRecipients}
					placeholder="email1@example.com, email2@example.com"
					rows="4"
				></textarea>
			</div>

			<div class="form-actions">
				<button class="btn-secondary" onclick={resetForm} disabled={saving}>Cancel</button>
				<button class="btn-primary" onclick={saveSchedule} disabled={saving}>
					{saving ? 'Saving...' : 'Save Schedule'}
				</button>
			</div>
		</div>
	{:else}
		<button class="btn-add" onclick={() => (showAddForm = true)}>Add Schedule</button>
	{/if}

	{#if message}
		<div class="message {messageType}">{message}</div>
	{/if}
</section>

<style>
	.schedules-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-bottom: 24px;
	}

	.schedule-item {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 16px;
	}

	.schedule-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.schedule-type {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.type-badge {
		background: var(--accent);
		color: var(--bg-card);
		padding: 4px 12px;
		border-radius: 4px;
		font-size: 14px;
		font-weight: 600;
	}

	.frequency-label,
	.day-label {
		color: var(--text-muted);
		font-size: 14px;
	}

	.schedule-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.toggle-switch {
		position: relative;
		display: inline-block;
		width: 52px;
		height: 28px;
		min-width: 52px;
		min-height: 28px;
	}

	.toggle-switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-slider {
		position: absolute;
		cursor: pointer;
		inset: 0;
		background-color: var(--border);
		transition: 0.2s;
		border-radius: 28px;
	}

	.toggle-slider:before {
		position: absolute;
		content: '';
		height: 20px;
		width: 20px;
		left: 4px;
		bottom: 4px;
		background-color: var(--bg-card);
		transition: 0.2s;
		border-radius: 50%;
	}

	input:checked + .toggle-slider {
		background-color: var(--accent);
	}

	input:checked + .toggle-slider:before {
		transform: translateX(24px);
	}

	.delete-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		min-width: 48px;
		min-height: 48px;
		transition: color 0.2s;
	}

	.delete-btn:hover {
		color: #ef4444;
	}

	.schedule-details {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.detail-row {
		display: flex;
		gap: 8px;
		font-size: 14px;
	}

	.detail-label {
		color: var(--text-muted);
		min-width: 80px;
	}

	.recipients {
		color: var(--text);
	}

	.more-recipients {
		color: var(--text-muted);
		font-style: italic;
	}

	.last-sent {
		color: var(--text-muted);
	}

	.add-form {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 20px;
		margin-bottom: 16px;
	}

	.add-form h4 {
		margin: 0 0 16px;
		color: var(--text);
		font-size: 16px;
		font-weight: 600;
	}

	.form-group {
		margin-bottom: 16px;
	}

	.form-group label {
		display: block;
		margin-bottom: 8px;
		color: var(--text);
		font-size: 14px;
		font-weight: 500;
	}

	.form-group select,
	.form-group textarea {
		width: 100%;
		padding: 12px;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text);
		font-size: 14px;
		min-height: 48px;
	}

	.form-group textarea {
		resize: vertical;
		font-family: inherit;
	}

	.form-actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}

	.btn-add {
		background: var(--accent);
		color: var(--bg-card);
		border: none;
		padding: 14px 24px;
		border-radius: 8px;
		font-weight: 600;
		font-size: 16px;
		cursor: pointer;
		min-height: 48px;
		transition: opacity 0.2s;
	}

	.btn-add:hover {
		opacity: 0.9;
	}

	.btn-primary,
	.btn-secondary {
		padding: 12px 24px;
		border-radius: 8px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		border: none;
		min-height: 48px;
		transition: opacity 0.2s;
	}

	.btn-primary {
		background: var(--accent);
		color: var(--bg-card);
	}

	.btn-secondary {
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--border);
	}

	.btn-primary:hover,
	.btn-secondary:hover {
		opacity: 0.9;
	}

	.btn-primary:disabled,
	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.message {
		padding: 12px 16px;
		border-radius: 6px;
		font-size: 14px;
		margin-top: 16px;
	}

	.message.ok {
		background: rgba(34, 197, 94, 0.1);
		color: #22c55e;
		border: 1px solid rgba(34, 197, 94, 0.2);
	}

	.message.error {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.2);
	}
</style>
