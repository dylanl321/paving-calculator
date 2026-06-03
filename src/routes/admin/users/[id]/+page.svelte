<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { confirmStore } from '$lib/stores/confirm.svelte';

	interface UserDetail {
		id: string;
		email: string;
		name: string;
		phone: string | null;
		is_global_admin: boolean;
		disabled: boolean;
		email_verified: boolean;
		created_at: number;
	}

	interface Membership {
		org_id: string;
		org_name: string;
		role: string;
		invited_at: number;
		accepted_at: number | null;
	}

	interface Session {
		id: string;
		created_at: number;
		expires_at: number;
		expired: boolean;
	}

	const userId = $derived($page.params.id ?? '');

	let user = $state<UserDetail | null>(null);
	let memberships = $state<Membership[]>([]);
	let sessions = $state<Session[]>([]);
	let activeSessionCount = $state(0);
	let loading = $state(true);
	let error = $state('');
	let busy = $state(false);

	onMount(load);

	async function load() {
		loading = true;
		error = '';
		try {
			const res = await fetch(`/api/admin/users/${userId}`);
			if (!res.ok) {
				error = res.status === 403 ? 'Access denied' : 'Failed to load user';
				return;
			}
			const data = (await res.json()) as {
				user: UserDetail;
				memberships: Membership[];
				sessions: Session[];
				activeSessionCount: number;
			};
			user = data.user;
			memberships = data.memberships;
			sessions = data.sessions;
			activeSessionCount = data.activeSessionCount;
		} catch {
			error = 'Failed to load user';
		} finally {
			loading = false;
		}
	}

	async function logoutEverywhere() {
		if (busy) return;
		const confirmed = await confirmStore.ask({
			title: 'Revoke All Sessions',
			message: 'Revoke all active sessions for this user? They will be logged out everywhere.',
			confirmLabel: 'Revoke',
			destructive: true
		});
		if (!confirmed) return;
		busy = true;
		try {
			const res = await fetch(`/api/admin/users/${userId}/logout-all`, { method: 'POST' });
			if (!res.ok) {
				toastStore.error('Failed to revoke sessions');
				return;
			}
			toastStore.success('All sessions revoked');
			await load();
		} finally {
			busy = false;
		}
	}

	async function verifyAction(action: 'force_verify' | 'unverify' | 'resend') {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch(`/api/admin/users/${userId}/verify-email`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action })
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				toastStore.error(data.error || 'Action failed');
				return;
			}
			if (action === 'force_verify') toastStore.success('Email marked verified');
			else if (action === 'unverify') toastStore.success('Email marked unverified');
			else toastStore.success('Verification email sent');
			await load();
		} finally {
			busy = false;
		}
	}

	async function sendPasswordReset() {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch(`/api/admin/users/${userId}/send-password-reset`, { method: 'POST' });
			const data = (await res.json()) as { error?: string };
			if (!res.ok) {
				toastStore.error(data.error || 'Failed to send reset email');
				return;
			}
			toastStore.success('Password reset email sent');
		} finally {
			busy = false;
		}
	}

	function formatDate(ts: number): string {
		return new Date(ts * 1000).toLocaleString();
	}
</script>

<div class="user-detail">
	<header>
		<div>
			<a class="back" href="/admin/users">← Users</a>
			<h1>{user ? user.name : 'User'}</h1>
		</div>
	</header>

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if error}
		<div class="error">{error}</div>
	{:else if user}
		<section class="card">
			<h2>Profile</h2>
			<dl>
				<div><dt>Email</dt><dd>{user.email}</dd></div>
				<div><dt>Phone</dt><dd>{user.phone || '—'}</dd></div>
				<div>
					<dt>Status</dt>
					<dd>
						<span class="pill" class:good={!user.disabled} class:bad={user.disabled}>
							{user.disabled ? 'Disabled' : 'Active'}
						</span>
					</dd>
				</div>
				<div>
					<dt>Global Admin</dt>
					<dd>{user.is_global_admin ? 'Yes' : 'No'}</dd>
				</div>
				<div>
					<dt>Email Verified</dt>
					<dd>
						<span class="pill" class:good={user.email_verified} class:warn={!user.email_verified}>
							{user.email_verified ? 'Verified' : 'Unverified'}
						</span>
					</dd>
				</div>
				<div><dt>Created</dt><dd>{formatDate(user.created_at)}</dd></div>
			</dl>
		</section>

		<section class="card">
			<h2>Email Verification</h2>
			<div class="actions">
				{#if user.email_verified}
					<button onclick={() => verifyAction('unverify')} disabled={busy}>Mark Unverified</button>
				{:else}
					<button class="accent" onclick={() => verifyAction('force_verify')} disabled={busy}>
						Force Verify
					</button>
					<button onclick={() => verifyAction('resend')} disabled={busy}>Resend Verification</button>
				{/if}
			</div>
		</section>

		<section class="card">
			<h2>Password</h2>
			<div class="actions">
				<button onclick={sendPasswordReset} disabled={busy}>Send Password Reset Email</button>
			</div>
		</section>

		<section class="card">
			<h2>Organizations</h2>
			{#if memberships.length === 0}
				<p class="muted">No organization memberships.</p>
			{:else}
				<table>
					<thead>
						<tr><th>Organization</th><th>Role</th><th>Joined</th></tr>
					</thead>
					<tbody>
						{#each memberships as m}
							<tr>
								<td>{m.org_name}</td>
								<td>{m.role}</td>
								<td>{m.accepted_at ? formatDate(m.accepted_at) : 'Pending'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		<section class="card">
			<div class="card-head">
				<h2>Sessions ({activeSessionCount} active)</h2>
				<button class="danger" onclick={logoutEverywhere} disabled={busy || sessions.length === 0}>
					Log out everywhere
				</button>
			</div>
			{#if sessions.length === 0}
				<p class="muted">No sessions.</p>
			{:else}
				<table>
					<thead>
						<tr><th>Created</th><th>Expires</th><th>State</th></tr>
					</thead>
					<tbody>
						{#each sessions as s}
							<tr>
								<td>{formatDate(s.created_at)}</td>
								<td>{formatDate(s.expires_at)}</td>
								<td>
									<span class="pill" class:good={!s.expired} class:bad={s.expired}>
										{s.expired ? 'Expired' : 'Active'}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	{/if}
</div>

<style>
	.user-detail {
		padding: 1rem;
		max-width: 1000px;
		margin: 0 auto;
	}

	header {
		margin-bottom: 1.5rem;
		border-bottom: 2px solid var(--border);
		padding-bottom: 1rem;
	}

	.back {
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.875rem;
	}

	.back:hover {
		color: var(--text);
	}

	h1 {
		font-size: 1.75rem;
		margin: 0.25rem 0 0 0;
		color: var(--text);
	}

	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.25rem;
		margin-bottom: 1.25rem;
	}

	.card h2 {
		font-size: 1.1rem;
		margin: 0 0 1rem 0;
		color: var(--text);
	}

	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}

	.card-head h2 {
		margin: 0;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
		margin: 0;
	}

	dt {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin-bottom: 0.25rem;
	}

	dd {
		margin: 0;
		color: var(--text);
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	button {
		padding: 0.5rem 1rem;
		min-height: var(--touch);
		background: var(--surface-alt);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.9rem;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: var(--surface-hover);
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	button.accent {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: 600;
	}

	button.danger {
		background: rgba(var(--bad-rgb), 0.1);
		color: var(--bad);
		border-color: var(--bad);
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		text-align: left;
		padding: 0.5rem;
		font-size: 0.8rem;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
	}

	td {
		padding: 0.5rem;
		border-bottom: 1px solid var(--border);
		color: var(--text);
	}

	.pill {
		display: inline-block;
		padding: 0.15rem 0.6rem;
		border-radius: var(--radius);
		font-size: 0.8rem;
	}

	.pill.good {
		background: rgba(63, 178, 127, 0.15);
		color: var(--good);
	}

	.pill.bad {
		background: rgba(var(--bad-rgb), 0.15);
		color: var(--bad);
	}

	.pill.warn {
		background: rgba(242, 192, 55, 0.15);
		color: var(--accent);
	}

	.muted {
		color: var(--text-muted);
	}

	.error {
		color: var(--bad);
		background: var(--surface);
		border: 1px solid var(--bad);
		border-radius: var(--radius);
		padding: 1rem;
	}
</style>
