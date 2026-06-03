<script lang="ts">
	import type { NotificationPrefsResult } from './shared';
	import { onMount } from 'svelte';
	import { toastStore } from '$lib/stores/toast.svelte';

	let { initialPrefs }: { initialPrefs: Record<string, boolean> } = $props();

	let notificationPrefs = $state<Record<string, boolean>>(initialPrefs ?? {});
	let savingNotifications = $state(false);
	let notificationMessage = $state('');
	let notificationMessageType = $state<'ok' | 'error'>('ok');

	// Report recipients
	let reportRecipients = $state<string[]>([]);
	let newRecipientEmail = $state('');
	let savingRecipients = $state(false);
	let recipientsMessage = $state('');
	let recipientsMessageType = $state<'ok' | 'error'>('ok');
	let canEditRecipients = $state(true); // Set based on role

	onMount(async () => {
		// Fetch current report recipients
		try {
			const res = await fetch('/api/org/settings', { credentials: 'include' });
			if (res.ok) {
				const data = (await res.json()) as { reportRecipients?: string[] };
				reportRecipients = data.reportRecipients || [];
				// Check if user can edit (owner/admin only)
				// For simplicity, we'll allow editing for now and rely on API to enforce
			}
		} catch (e) {
			console.error('Failed to load report recipients:', e);
		}
	});

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
				toastStore.error(notificationMessage);
				return;
			}
			notificationPrefs = result.prefs ?? notificationPrefs;
			notificationMessage = 'Notification preferences saved';
			notificationMessageType = 'ok';
			toastStore.success('Notification preferences saved');
		} catch (e) {
			notificationMessage = 'Network error while saving';
			notificationMessageType = 'error';
			toastStore.error('Failed to save preferences');
		} finally {
			savingNotifications = false;
		}
	}

	function addRecipient() {
		const email = newRecipientEmail.trim();
		if (!email) return;

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			recipientsMessage = 'Invalid email address';
			recipientsMessageType = 'error';
			return;
		}

		if (email.length > 100) {
			recipientsMessage = 'Email must be 100 characters or less';
			recipientsMessageType = 'error';
			return;
		}

		if (reportRecipients.includes(email)) {
			recipientsMessage = 'Email already in list';
			recipientsMessageType = 'error';
			return;
		}

		if (reportRecipients.length >= 10) {
			recipientsMessage = 'Maximum 10 recipients allowed';
			recipientsMessageType = 'error';
			return;
		}

		reportRecipients = [...reportRecipients, email];
		newRecipientEmail = '';
		recipientsMessage = '';
	}

	function removeRecipient(email: string) {
		reportRecipients = reportRecipients.filter((e) => e !== email);
	}

	async function saveRecipients() {
		savingRecipients = true;
		recipientsMessage = '';
		try {
			const res = await fetch('/api/org/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ reportRecipients })
			});
			const result = (await res.json()) as { error?: string; reportRecipients?: string[] };
			if (!res.ok) {
				recipientsMessage = result.error || 'Failed to save recipients';
				recipientsMessageType = 'error';
				toastStore.error(recipientsMessage);
				return;
			}
			reportRecipients = result.reportRecipients || reportRecipients;
			recipientsMessage = 'Recipients saved successfully';
			recipientsMessageType = 'ok';
			toastStore.success('Recipients saved successfully');

			// Clear message after 3 seconds
			setTimeout(() => {
				if (recipientsMessageType === 'ok') {
					recipientsMessage = '';
				}
			}, 3000);
		} catch (e) {
			recipientsMessage = 'Network error while saving';
			recipientsMessageType = 'error';
			toastStore.error('Failed to save recipients');
		} finally {
			savingRecipients = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			addRecipient();
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

<section class="card">
	<h3>Report Recipients</h3>
	<p class="card-desc">Configure email addresses that will receive PDF reports when shared. Maximum 10 recipients.</p>

	<div class="recipients-list">
		{#if reportRecipients.length === 0}
			<p class="empty-state">No recipients configured. Add email addresses below to enable PDF sharing.</p>
		{:else}
			<div class="recipient-chips">
				{#each reportRecipients as email}
					<div class="recipient-chip">
						<span class="recipient-email">{email}</span>
						<button
							type="button"
							class="remove-btn"
							onclick={() => removeRecipient(email)}
							aria-label="Remove {email}"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<line x1="18" y1="6" x2="6" y2="18"></line>
								<line x1="6" y1="6" x2="18" y2="18"></line>
							</svg>
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="add-recipient-section">
		<div class="input-group">
			<input
				type="email"
				class="recipient-input"
				placeholder="email@example.com"
				bind:value={newRecipientEmail}
				onkeydown={handleKeydown}
				disabled={reportRecipients.length >= 10}
			/>
			<button
				type="button"
				class="add-btn"
				onclick={addRecipient}
				disabled={!newRecipientEmail || reportRecipients.length >= 10}
			>
				Add
			</button>
		</div>
		{#if reportRecipients.length >= 10}
			<p class="limit-note">Maximum of 10 recipients reached</p>
		{/if}
	</div>

	<div class="notification-save-bar">
		{#if recipientsMessage}
			<span class="save-msg" class:error={recipientsMessageType === 'error'}>{recipientsMessage}</span>
		{/if}
		<button type="button" class="save-btn" onclick={saveRecipients} disabled={savingRecipients}>
			{savingRecipients ? 'Saving…' : 'Save Recipients'}
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

	/* Report recipients styles */
	.recipients-list {
		margin-bottom: 16px;
	}

	.empty-state {
		color: var(--text-muted);
		font-size: 0.88rem;
		text-align: center;
		padding: 24px;
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		margin: 0;
	}

	.recipient-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.recipient-chip {
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 100px;
		padding: 8px 12px;
		font-size: 0.88rem;
		min-height: 36px;
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
		transition: all 0.15s;
	}

	.remove-btn:hover {
		background: rgba(255, 255, 255, 0.05);
		color: #ef4444;
	}

	.add-recipient-section {
		margin-bottom: 20px;
	}

	.input-group {
		display: flex;
		gap: 8px;
		margin-bottom: 8px;
	}

	.recipient-input {
		flex: 1;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.9rem;
		padding: 0 14px;
		height: 48px;
	}

	.recipient-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.recipient-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.add-btn {
		background: var(--accent);
		border: 1px solid var(--accent);
		color: var(--accent-text);
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		padding: 0 24px;
		height: 48px;
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

	.limit-note {
		color: var(--text-muted);
		font-size: 0.82rem;
		margin: 0;
	}
</style>
