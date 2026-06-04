<script lang="ts">
	import type { NotificationPrefsResult } from './shared';
	import { onMount } from 'svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { api } from '$lib/utils/api-error';

	let { initialPrefs }: { initialPrefs: Record<string, boolean> } = $props();

	// ─── Personal prefs ───────────────────────────────────────────────────────
	let notificationPrefs = $state<Record<string, boolean>>(initialPrefs ?? {});
	let savingNotifications = $state(false);

	async function saveNotificationPrefs() {
		savingNotifications = true;
		try {
			const result = await api.put<NotificationPrefsResult>('/api/user/notification-prefs', { prefs: notificationPrefs });
			notificationPrefs = result.prefs ?? notificationPrefs;
			toastStore.success('Notification preferences saved');
		} catch {
			toastStore.error('Failed to save preferences');
		} finally {
			savingNotifications = false;
		}
	}

	// ─── Org notification schedules ───────────────────────────────────────────

	interface OrgSchedule {
		id: string | null;
		scheduleType: 'eod_summary' | 'weekly_report';
		enabled: boolean;
		sendTime: string;
		timezone: string;
		recipients: string[];
	}

	const ROLE_GROUPS = [
		{ value: 'all_admins', label: 'All Admins' },
		{ value: 'all_foremen', label: 'All Foremen' },
		{ value: 'all_members', label: 'All Members' }
	] as const;

	const SCHEDULE_TYPES: { type: OrgSchedule['scheduleType']; label: string; desc: string }[] = [
		{
			type: 'eod_summary',
			label: 'EOD Summary',
			desc: 'Daily end-of-day email summarising job progress and tonnage'
		},
		{
			type: 'weekly_report',
			label: 'Weekly Report',
			desc: 'Weekly rollup emailed every Monday with production metrics'
		}
	];

	let schedules = $state<OrgSchedule[]>(
		SCHEDULE_TYPES.map((t) => ({
			id: null,
			scheduleType: t.type,
			enabled: false,
			sendTime: '17:00',
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago',
			recipients: []
		}))
	);

	let loadingSchedules = $state(true);
	let savingScheduleIndex = $state<number | null>(null);

	// ─── Per-schedule recipient input state ───────────────────────────────────
	let newRecipientEmail = $state<string[]>(SCHEDULE_TYPES.map(() => ''));
	let recipientErrors = $state<string[]>(SCHEDULE_TYPES.map(() => ''));

	onMount(async () => {
		try {
			const res = await fetch('/api/org/notifications', { credentials: 'include' });
			if (res.ok) {
				const data = (await res.json()) as {
					schedules: {
						id: string;
						scheduleType: string;
						enabled: boolean;
						sendTime: string;
						timezone: string;
						recipients: string[];
					}[];
				};
				for (const srv of data.schedules) {
					const idx = schedules.findIndex((s) => s.scheduleType === srv.scheduleType);
					if (idx !== -1) {
						schedules[idx] = {
							id: srv.id,
							scheduleType: srv.scheduleType as OrgSchedule['scheduleType'],
							enabled: srv.enabled,
							sendTime: srv.sendTime,
							timezone: srv.timezone,
							recipients: srv.recipients
						};
					}
				}
			}
		} catch (e) {
			console.error('Failed to load notification schedules:', e);
		} finally {
			loadingSchedules = false;
		}
	});

	function isRoleGroup(value: string): boolean {
		return ROLE_GROUPS.some((g) => g.value === value);
	}

	function toggleRoleGroup(schedIdx: number, groupValue: string) {
		const current = schedules[schedIdx].recipients;
		if (current.includes(groupValue)) {
			schedules[schedIdx].recipients = current.filter((r) => r !== groupValue);
		} else {
			schedules[schedIdx].recipients = [...current, groupValue];
		}
	}

	const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	function addRecipient(schedIdx: number) {
		const email = newRecipientEmail[schedIdx].trim();
		if (!email) return;

		if (!EMAIL_RE.test(email)) {
			recipientErrors[schedIdx] = 'Invalid email address';
			return;
		}
		if (email.length > 100) {
			recipientErrors[schedIdx] = 'Email must be 100 characters or less';
			return;
		}
		const current = schedules[schedIdx].recipients;
		if (current.includes(email)) {
			recipientErrors[schedIdx] = 'Email already added';
			return;
		}
		if (current.filter((r) => !isRoleGroup(r)).length >= 10) {
			recipientErrors[schedIdx] = 'Maximum 10 email recipients';
			return;
		}
		schedules[schedIdx].recipients = [...current, email];
		newRecipientEmail[schedIdx] = '';
		recipientErrors[schedIdx] = '';
	}

	function removeRecipient(schedIdx: number, value: string) {
		schedules[schedIdx].recipients = schedules[schedIdx].recipients.filter((r) => r !== value);
	}

	function handleKeydown(e: KeyboardEvent, schedIdx: number) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addRecipient(schedIdx);
		}
	}

	async function saveSchedule(schedIdx: number) {
		const sched = schedules[schedIdx];
		if (!sched.enabled && sched.recipients.length === 0) {
			// Allow saving disabled schedule with no recipients
		} else if (sched.enabled && sched.recipients.length === 0) {
			toastStore.error('Add at least one recipient before enabling');
			return;
		}

		savingScheduleIndex = schedIdx;
		try {
			const body: Record<string, unknown> = {
				scheduleType: sched.scheduleType,
				enabled: sched.enabled,
				sendTime: sched.sendTime,
				timezone: sched.timezone,
				recipients: sched.recipients
			};
			if (sched.id) body.id = sched.id;

			const result = await api.post<{ ok?: boolean; id?: string; error?: string }>('/api/org/notifications', body);
			if (!result.ok && result.error) {
				toastStore.error(result.error || 'Failed to save schedule');
				return;
			}
			if (result.id && !sched.id) {
				schedules[schedIdx].id = result.id;
			}
			toastStore.success(
				`${SCHEDULE_TYPES[schedIdx].label} schedule saved`
			);
		} catch {
			toastStore.error('Network error while saving');
		} finally {
			savingScheduleIndex = null;
		}
	}
</script>

<!-- ═══ Personal notification preferences ═══════════════════════════════════ -->
<section class="card">
	<h3>Notification Preferences</h3>
	<p class="card-desc">Control which notifications you receive for your account.</p>

	<div class="notification-group">
		<h4 class="group-heading">Email Notifications</h4>
		<label class="notification-toggle">
			<input type="checkbox" bind:checked={notificationPrefs.email_daily_summary} />
			<div class="notification-info">
				<span class="notification-label">Daily Summary</span>
				<span class="notification-desc">Receive a daily email summary of job activity</span>
			</div>
		</label>
		<label class="notification-toggle">
			<input type="checkbox" bind:checked={notificationPrefs.email_invite} />
			<div class="notification-info">
				<span class="notification-label">Organization Invites</span>
				<span class="notification-desc">Email notifications when invited to an organization</span>
			</div>
		</label>
		<label class="notification-toggle">
			<input type="checkbox" bind:checked={notificationPrefs.email_spec_alerts} />
			<div class="notification-info">
				<span class="notification-label">Specification Alerts</span>
				<span class="notification-desc">Real-time alerts for spec violations via email</span>
			</div>
		</label>
		<label class="notification-toggle">
			<input type="checkbox" bind:checked={notificationPrefs.email_job_updates} />
			<div class="notification-info">
				<span class="notification-label">Job Status Changes</span>
				<span class="notification-desc">Email when job site status changes</span>
			</div>
		</label>
	</div>

	<div class="notification-group">
		<h4 class="group-heading">Push Notifications</h4>
		<label class="notification-toggle">
			<input type="checkbox" bind:checked={notificationPrefs.push_spec_alerts} />
			<div class="notification-info">
				<span class="notification-label">Specification Alerts</span>
				<span class="notification-desc">Browser push notifications for spec violations</span>
			</div>
		</label>
		<label class="notification-toggle">
			<input type="checkbox" bind:checked={notificationPrefs.push_job_updates} />
			<div class="notification-info">
				<span class="notification-label">Job Updates</span>
				<span class="notification-desc">Browser push notifications for job site updates</span>
			</div>
		</label>
	</div>

	<div class="notification-save-bar">
		<button
			type="button"
			class="save-btn"
			onclick={saveNotificationPrefs}
			disabled={savingNotifications}
		>
			{savingNotifications ? 'Saving...' : 'Save Preferences'}
		</button>
	</div>
</section>

<!-- ═══ Org notification schedules ══════════════════════════════════════════ -->
<section class="card">
	<h3>Scheduled Notifications</h3>
	<p class="card-desc">
		Configure automated email reports sent to your team. Requires admin or owner role.
	</p>

	{#if loadingSchedules}
		<p class="loading-msg">Loading schedules...</p>
	{:else}
		{#each SCHEDULE_TYPES as schedDef, idx}
			{@const sched = schedules[idx]}
			<div class="schedule-card">
				<!-- Header row: toggle + title -->
				<div class="schedule-header">
					<label class="toggle-switch" aria-label="Enable {schedDef.label}">
						<input type="checkbox" bind:checked={sched.enabled} />
						<span class="toggle-track">
							<span class="toggle-thumb"></span>
						</span>
					</label>
					<div class="schedule-title-block">
						<span class="schedule-title">{schedDef.label}</span>
						<span class="schedule-desc">{schedDef.desc}</span>
					</div>
					<span class="schedule-badge" class:badge-on={sched.enabled} class:badge-off={!sched.enabled}>
						{sched.enabled ? 'Enabled' : 'Disabled'}
					</span>
				</div>

				<!-- Time + timezone row -->
				<div class="schedule-row">
					<label class="field-label" for="send-time-{idx}">Send time</label>
					<input
						id="send-time-{idx}"
						type="time"
						class="time-input"
						bind:value={sched.sendTime}
					/>
					<label class="field-label" for="tz-{idx}">Timezone</label>
					<input
						id="tz-{idx}"
						type="text"
						class="tz-input"
						bind:value={sched.timezone}
						placeholder="America/Chicago"
						autocomplete="off"
					/>
				</div>

				<!-- Role group shortcuts -->
				<div class="recipients-section">
					<p class="field-label">Recipients</p>
					<div class="role-group-row">
						{#each ROLE_GROUPS as group}
							<button
								type="button"
								class="role-chip"
								class:role-chip-active={sched.recipients.includes(group.value)}
								onclick={() => toggleRoleGroup(idx, group.value)}
							>
								{group.label}
							</button>
						{/each}
					</div>

					<!-- Current recipients -->
					{#if sched.recipients.length > 0}
						<div class="recipient-chips">
							{#each sched.recipients as recipient}
								{@const roleLabel = ROLE_GROUPS.find((g) => g.value === recipient)?.label}
								<div class="recipient-chip" class:chip-role={!!roleLabel}>
									<span class="recipient-email">{roleLabel ?? recipient}</span>
									<button
										type="button"
										class="remove-btn"
										onclick={() => removeRecipient(idx, recipient)}
										aria-label="Remove {roleLabel ?? recipient}"
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
										>
											<line x1="18" y1="6" x2="6" y2="18"></line>
											<line x1="6" y1="6" x2="18" y2="18"></line>
										</svg>
									</button>
								</div>
							{/each}
						</div>
					{:else}
						<p class="empty-recipients">No recipients yet. Add role groups or email addresses.</p>
					{/if}

					<!-- Add email input -->
					<div class="add-email-row">
						<input
							type="email"
							class="recipient-input"
							placeholder="engineer@company.com"
							bind:value={newRecipientEmail[idx]}
							onkeydown={(e) => handleKeydown(e, idx)}
							autocomplete="off"
						/>
						<button
							type="button"
							class="add-btn"
							onclick={() => addRecipient(idx)}
							disabled={!newRecipientEmail[idx]}
						>
							Add Email
						</button>
					</div>
					{#if recipientErrors[idx]}
						<p class="field-error">{recipientErrors[idx]}</p>
					{/if}
				</div>

				<!-- Save row -->
				<div class="schedule-save-row">
					<button
						type="button"
						class="save-btn"
						onclick={() => saveSchedule(idx)}
						disabled={savingScheduleIndex === idx}
					>
						{savingScheduleIndex === idx ? 'Saving...' : 'Save'}
					</button>
				</div>
			</div>
		{/each}
	{/if}
</section>

<style>
	/* ── Personal prefs ─────────────────────────────────── */
	.notification-group {
		margin-bottom: 24px;
	}

	.notification-group:last-of-type {
		margin-bottom: 20px;
	}

	.group-heading {
		margin: 0 0 12px;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text);
	}

	.notification-toggle {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px;
		margin-bottom: 8px;
		border-radius: var(--radius);
		cursor: pointer;
		min-height: 48px;
		transition: background 0.15s;
	}

	.notification-toggle:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	.notification-toggle input[type='checkbox'] {
		width: 20px;
		min-height: 20px;
		height: 20px;
		margin-top: 2px;
		flex-shrink: 0;
		cursor: pointer;
	}

	.notification-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.notification-label {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text);
	}

	.notification-desc {
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.notification-save-bar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 14px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}

	/* ── Scheduled notifications ────────────────────────── */
	.loading-msg {
		color: var(--text-muted);
		font-size: 0.88rem;
		padding: 16px 0;
	}

	.schedule-card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 16px;
	}

	.schedule-card:last-child {
		margin-bottom: 0;
	}

	.schedule-header {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 16px;
	}

	/* Toggle switch */
	.toggle-switch {
		position: relative;
		display: inline-flex;
		cursor: pointer;
		flex-shrink: 0;
	}

	.toggle-switch input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-track {
		display: flex;
		align-items: center;
		width: 44px;
		height: 26px;
		border-radius: 100px;
		background: var(--surface);
		border: 1px solid var(--border);
		transition: background 0.2s, border-color 0.2s;
		padding: 2px;
	}

	.toggle-switch input:checked ~ .toggle-track {
		background: var(--accent);
		border-color: var(--accent);
	}

	.toggle-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--text-muted);
		transition: transform 0.2s, background 0.2s;
		flex-shrink: 0;
	}

	.toggle-switch input:checked ~ .toggle-track .toggle-thumb {
		transform: translateX(18px);
		background: #fff;
	}

	.schedule-title-block {
		display: flex;
		flex-direction: column;
		gap: 3px;
		flex: 1;
	}

	.schedule-title {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text);
	}

	.schedule-desc {
		font-size: 0.8rem;
		color: var(--text-muted);
		line-height: 1.3;
	}

	.schedule-badge {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 3px 10px;
		border-radius: 100px;
		white-space: nowrap;
	}

	.badge-on {
		background: rgba(34, 197, 94, 0.15);
		color: #22c55e;
	}

	.badge-off {
		background: rgba(255, 255, 255, 0.05);
		color: var(--text-muted);
	}

	/* Time / tz row */
	.schedule-row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}

	.field-label {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--text-muted);
		margin: 0;
		white-space: nowrap;
	}

	.time-input,
	.tz-input {
		height: 40px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.9rem;
		padding: 0 12px;
	}

	.time-input {
		width: 110px;
	}

	.tz-input {
		flex: 1;
		min-width: 160px;
		max-width: 260px;
	}

	.time-input:focus,
	.tz-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	/* Recipients */
	.recipients-section {
		margin-bottom: 16px;
	}

	.recipients-section > .field-label {
		display: block;
		margin-bottom: 10px;
	}

	.role-group-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 12px;
	}

	.role-chip {
		height: 34px;
		padding: 0 14px;
		border-radius: 100px;
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-muted);
		transition: all 0.15s;
		display: flex;
		align-items: center;
	}

	.role-chip:hover {
		border-color: var(--accent);
		color: var(--text);
	}

	.role-chip-active {
		background: rgba(var(--accent-rgb, 251, 191, 36), 0.15);
		border-color: var(--accent);
		color: var(--accent);
	}

	.recipient-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 12px;
	}

	.recipient-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 100px;
		padding: 6px 12px;
		font-size: 0.82rem;
		min-height: 32px;
	}

	.chip-role {
		border-color: var(--accent);
		background: rgba(var(--accent-rgb, 251, 191, 36), 0.08);
	}

	.recipient-email {
		color: var(--text);
	}

	.remove-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 2px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		min-width: 20px;
		min-height: 20px;
		transition: all 0.15s;
	}

	.remove-btn:hover {
		background: rgba(255, 255, 255, 0.05);
		color: #ef4444;
	}

	.empty-recipients {
		color: var(--text-muted);
		font-size: 0.82rem;
		padding: 12px;
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		margin: 0 0 12px;
	}

	.add-email-row {
		display: flex;
		gap: 8px;
	}

	.recipient-input {
		flex: 1;
		height: 48px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.9rem;
		padding: 0 14px;
	}

	.recipient-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.add-btn {
		height: 48px;
		padding: 0 20px;
		background: var(--accent);
		border: 1px solid var(--accent);
		color: var(--accent-text);
		border-radius: var(--radius);
		font-size: 0.88rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		transition: opacity 0.15s;
	}

	.add-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.add-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.field-error {
		color: #ef4444;
		font-size: 0.8rem;
		margin: 6px 0 0;
	}

	.schedule-save-row {
		display: flex;
		justify-content: flex-end;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}

	/* Shared save button */
	.save-btn {
		height: 48px;
		padding: 0 24px;
		background: var(--accent);
		border: 1px solid var(--accent);
		color: var(--accent-text);
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.save-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
