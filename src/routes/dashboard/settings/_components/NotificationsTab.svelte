<script lang="ts">
	import type { NotificationPrefsResult } from './shared';

	let { initialPrefs }: { initialPrefs: Record<string, boolean> } = $props();

	let notificationPrefs = $state<Record<string, boolean>>(initialPrefs ?? {});
	let savingNotifications = $state(false);
	let notificationMessage = $state('');
	let notificationMessageType = $state<'ok' | 'error'>('ok');

	async function saveNotificationPrefs() {
		savingNotifications = true;
		notificationMessage = '';
		try {
			const res = await fetch('/api/user/notification-prefs', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ prefs: notificationPrefs })
			});
			const result = (await res.json()) as NotificationPrefsResult;
			if (!res.ok) {
				notificationMessage = result.error || 'Failed to save preferences';
				notificationMessageType = 'error';
				return;
			}
			notificationPrefs = result.prefs ?? notificationPrefs;
			notificationMessage = 'Notification preferences saved';
			notificationMessageType = 'ok';
		} catch (e) {
			notificationMessage = 'Network error while saving';
			notificationMessageType = 'error';
		} finally {
			savingNotifications = false;
		}
	}
</script>

<section class="card">
	<h3>Notification Preferences</h3>
	<p class="card-desc">Control which notifications you receive for your account.</p>

	<div class="notification-group">
		<h4 class="group-heading">Email Notifications</h4>
		<label class="notification-toggle">
			<input
				type="checkbox"
				bind:checked={notificationPrefs.email_daily_summary}
			/>
			<div class="notification-info">
				<span class="notification-label">Daily Summary</span>
				<span class="notification-desc">Receive a daily email summary of job activity</span>
			</div>
		</label>
		<label class="notification-toggle">
			<input
				type="checkbox"
				bind:checked={notificationPrefs.email_invite}
			/>
			<div class="notification-info">
				<span class="notification-label">Organization Invites</span>
				<span class="notification-desc">Email notifications when invited to an organization</span>
			</div>
		</label>
		<label class="notification-toggle">
			<input
				type="checkbox"
				bind:checked={notificationPrefs.email_spec_alerts}
			/>
			<div class="notification-info">
				<span class="notification-label">Specification Alerts</span>
				<span class="notification-desc">Real-time alerts for spec violations via email</span>
			</div>
		</label>
		<label class="notification-toggle">
			<input
				type="checkbox"
				bind:checked={notificationPrefs.email_job_updates}
			/>
			<div class="notification-info">
				<span class="notification-label">Job Status Changes</span>
				<span class="notification-desc">Email when job site status changes</span>
			</div>
		</label>
	</div>

	<div class="notification-group">
		<h4 class="group-heading">Push Notifications</h4>
		<label class="notification-toggle">
			<input
				type="checkbox"
				bind:checked={notificationPrefs.push_spec_alerts}
			/>
			<div class="notification-info">
				<span class="notification-label">Specification Alerts</span>
				<span class="notification-desc">Browser push notifications for spec violations</span>
			</div>
		</label>
		<label class="notification-toggle">
			<input
				type="checkbox"
				bind:checked={notificationPrefs.push_job_updates}
			/>
			<div class="notification-info">
				<span class="notification-label">Job Updates</span>
				<span class="notification-desc">Browser push notifications for job site updates</span>
			</div>
		</label>
	</div>

	<div class="notification-save-bar">
		{#if notificationMessage}
			<span class="save-msg" class:error={notificationMessageType === 'error'}>{notificationMessage}</span>
		{/if}
		<button type="button" class="save-btn" onclick={saveNotificationPrefs} disabled={savingNotifications}>
			{savingNotifications ? 'Saving…' : 'Save Preferences'}
		</button>
	</div>
</section>

<style>
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

	.notification-toggle input[type="checkbox"] {
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
</style>
