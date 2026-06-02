<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	type Member = {
		user_id: string;
		user_name: string;
		user_email: string;
		role: string;
		invited_at: number;
	};

	type Invitation = {
		id: string;
		email: string;
		role: string;
		invited_by_name: string;
		created_at: number;
		expires_at: number;
	};

	let members = $state<Member[]>([]);
	let invitations = $state<Invitation[]>([]);
	let loading = $state(true);
	let error = $state('');
	let showInviteModal = $state(false);
	let inviteForm = $state({ email: '', role: 'member' });
	let inviting = $state(false);
	let editingMember = $state<Member | null>(null);
	let editRole = $state('member');
	let currentUserId = $state<string | null>(null);
	let currentUserRole = $state<string | null>(null);

	onMount(async () => {
		await loadCurrentUser();
		await loadTeam();
	});

	async function loadCurrentUser() {
		try {
			const res = await fetch('/api/auth/me');
			if (res.ok) {
				const data = await res.json();
				currentUserId = data.user.id;
				currentUserRole = data.org.role;
			}
		} catch (e) {
			console.error('Failed to load current user:', e);
		}
	}

	async function loadTeam() {
		try {
			const [membersRes, invitesRes] = await Promise.all([
				fetch('/api/org'),
				fetch('/api/org/invite')
			]);

			if (!membersRes.ok) {
				if (membersRes.status === 401) {
					goto('/login');
					return;
				}
				error = 'Failed to load team members';
				loading = false;
				return;
			}

			const membersData = await membersRes.json();
			members = membersData.members || [];

			if (invitesRes.ok) {
				const invitesData = await invitesRes.json();
				invitations = invitesData.invitations || [];
			}
		} catch (e) {
			error = 'Failed to load team';
		} finally {
			loading = false;
		}
	}

	async function sendInvite() {
		if (!inviteForm.email.trim()) return;

		inviting = true;
		try {
			const res = await fetch('/api/org/invite', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: inviteForm.email.trim(),
					role: inviteForm.role
				})
			});

			if (!res.ok) {
				const data = await res.json();
				alert(data.error || 'Failed to send invitation');
				return;
			}

			await loadTeam();
			showInviteModal = false;
			inviteForm = { email: '', role: 'member' };
		} catch (e) {
			alert('Failed to send invitation');
		} finally {
			inviting = false;
		}
	}

	function startEditRole(member: Member) {
		editingMember = member;
		editRole = member.role;
	}

	async function saveRole() {
		if (!editingMember) return;

		try {
			const res = await fetch(`/api/org/members/${editingMember.user_id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: editRole })
			});

			if (!res.ok) {
				const data = await res.json();
				alert(data.error || 'Failed to update role');
				return;
			}

			await loadTeam();
			editingMember = null;
		} catch (e) {
			alert('Failed to update role');
		}
	}

	async function removeMember(member: Member) {
		if (!confirm(`Remove ${member.user_name} from the organization?`)) return;

		try {
			const res = await fetch(`/api/org/members/${member.user_id}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const data = await res.json();
				alert(data.error || 'Failed to remove member');
				return;
			}

			await loadTeam();
		} catch (e) {
			alert('Failed to remove member');
		}
	}

	function formatDate(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleDateString();
	}

	function canModifyMember(member: Member): boolean {
		// Hide actions if this is the current user AND they are the owner
		if (member.user_id === currentUserId && currentUserRole === 'owner') {
			return false;
		}
		return true;
	}
</script>

<div class="team-page">
	<header>
		<h1>Team Management</h1>
		<div class="actions">
			<a href="/dashboard">Back to Dashboard</a>
			<button onclick={() => (showInviteModal = true)}>Invite Member</button>
		</div>
	</header>

	{#if loading}
		<p class="loading">Loading...</p>
	{:else if error}
		<div class="error">{error}</div>
	{:else}
		<section class="members-section">
			<h2>Team Members ({members.length})</h2>
			{#if members.length === 0}
				<p class="empty">No team members yet</p>
			{:else}
				<div class="members-table-wrapper">
					<table class="members-table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Email</th>
								<th>Role</th>
								<th>Joined</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each members as member}
								<tr>
									<td data-label="Name">{member.user_name}</td>
									<td data-label="Email">{member.user_email}</td>
									<td data-label="Role">
										<span class="role-badge" class:owner={member.role === 'owner'}>
											{member.role}
										</span>
									</td>
									<td data-label="Joined">{formatDate(member.invited_at)}</td>
									<td data-label="Actions">
										{#if canModifyMember(member)}
											<div class="action-buttons">
												<button onclick={() => startEditRole(member)}>Change Role</button>
												<button class="danger" onclick={() => removeMember(member)}>
													Remove
												</button>
											</div>
										{:else}
											<span class="no-actions">—</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		{#if invitations.length > 0}
			<section class="invitations-section">
				<h2>Pending Invitations ({invitations.length})</h2>
				<div class="invitations-table-wrapper">
					<table class="invitations-table">
						<thead>
							<tr>
								<th>Email</th>
								<th>Role</th>
								<th>Invited By</th>
								<th>Sent</th>
								<th>Expires</th>
							</tr>
						</thead>
						<tbody>
							{#each invitations as invite}
								<tr>
									<td data-label="Email">{invite.email}</td>
									<td data-label="Role">{invite.role}</td>
									<td data-label="Invited By">{invite.invited_by_name}</td>
									<td data-label="Sent">{formatDate(invite.created_at)}</td>
									<td data-label="Expires">{formatDate(invite.expires_at)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	{/if}
</div>

{#if showInviteModal}
	<div class="modal-overlay" onclick={() => (showInviteModal = false)}></div>
	<div class="modal">
		<h2>Invite Team Member</h2>
		<form onsubmit={(e) => { e.preventDefault(); sendInvite(); }}>
			<label>
				Email
				<input
					type="email"
					bind:value={inviteForm.email}
					placeholder="member@example.com"
					required
					autofocus
				/>
			</label>
			<label>
				Role
				<select bind:value={inviteForm.role}>
					<option value="member">Member</option>
					<option value="admin">Admin</option>
					<option value="owner">Owner</option>
				</select>
			</label>
			<div class="modal-actions">
				<button type="button" onclick={() => (showInviteModal = false)}>Cancel</button>
				<button type="submit" disabled={inviting || !inviteForm.email.trim()}>
					{inviting ? 'Sending...' : 'Send Invite'}
				</button>
			</div>
		</form>
	</div>
{/if}

{#if editingMember}
	<div class="modal-overlay" onclick={() => (editingMember = null)}></div>
	<div class="modal">
		<h2>Change Role: {editingMember.user_name}</h2>
		<form onsubmit={(e) => { e.preventDefault(); saveRole(); }}>
			<label>
				Role
				<select bind:value={editRole}>
					<option value="member">Member</option>
					<option value="admin">Admin</option>
					<option value="owner">Owner</option>
				</select>
			</label>
			<div class="modal-actions">
				<button type="button" onclick={() => (editingMember = null)}>Cancel</button>
				<button type="submit">Save</button>
			</div>
		</form>
	</div>
{/if}

<style>
	.team-page {
		padding: 1rem;
		max-width: 1400px;
		margin: 0 auto;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 1.5rem;
		border-bottom: 2px solid var(--color-border);
		padding-bottom: 1rem;
	}

	h1 {
		font-size: 1.75rem;
		margin: 0;
		color: var(--color-text);
	}

	h2 {
		font-size: 1.25rem;
		margin: 0 0 1rem 0;
		color: var(--color-text);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.actions a,
	.actions button {
		padding: 0.5rem 1rem;
		min-height: 48px;
		display: flex;
		align-items: center;
		text-decoration: none;
		border-radius: 4px;
		border: none;
		font-size: 1rem;
		cursor: pointer;
	}

	.actions a {
		background: var(--color-bg-secondary);
		color: var(--color-text);
	}

	.actions button {
		background: var(--color-primary);
		color: white;
	}

	.actions a:hover,
	.actions button:hover {
		opacity: 0.9;
	}

	.loading,
	.error,
	.empty {
		text-align: center;
		padding: 2rem;
		font-size: 1.125rem;
	}

	.error {
		color: var(--color-error);
		background: var(--color-bg-secondary);
		border-radius: 8px;
	}

	section {
		background: var(--color-bg-secondary);
		padding: 1.5rem;
		border-radius: 8px;
		margin-bottom: 1.5rem;
	}

	.members-table-wrapper,
	.invitations-table-wrapper {
		overflow-x: auto;
	}

	.members-table,
	.invitations-table {
		width: 100%;
		border-collapse: collapse;
	}

	.members-table th,
	.invitations-table th {
		text-align: left;
		padding: 1rem;
		font-weight: 600;
		color: var(--color-text);
		border-bottom: 2px solid var(--color-border);
	}

	.members-table td,
	.invitations-table td {
		padding: 1rem;
		border-top: 1px solid var(--color-border);
	}

	.members-table tr:hover,
	.invitations-table tr:hover {
		background: var(--color-bg-hover);
	}

	.role-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		background: var(--color-bg-tertiary);
		color: var(--color-text);
		border-radius: 4px;
		font-size: 0.875rem;
		text-transform: capitalize;
	}

	.role-badge.owner {
		background: rgba(249, 115, 22, 0.2);
		color: rgb(249, 115, 22);
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.action-buttons button {
		padding: 0.25rem 0.75rem;
		min-height: 48px;
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.action-buttons button.danger {
		background: var(--color-error);
	}

	.action-buttons button:hover {
		opacity: 0.9;
	}

	.no-actions {
		color: var(--color-text-secondary);
		font-size: 1.25rem;
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 100;
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--color-bg);
		padding: 2rem;
		border-radius: 8px;
		z-index: 101;
		min-width: 300px;
		max-width: 500px;
		width: 90%;
	}

	.modal h2 {
		margin: 0 0 1.5rem 0;
		color: var(--color-text);
	}

	.modal label {
		display: block;
		margin-bottom: 1rem;
		color: var(--color-text);
	}

	.modal input,
	.modal select {
		display: block;
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.75rem;
		font-size: 1rem;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		background: var(--color-bg-secondary);
		color: var(--color-text);
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}

	.modal-actions button {
		padding: 0.5rem 1.5rem;
		min-height: 48px;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
	}

	.modal-actions button[type='button'] {
		background: var(--color-bg-secondary);
		color: var(--color-text);
	}

	.modal-actions button[type='submit'] {
		background: var(--color-primary);
		color: white;
	}

	.modal-actions button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.members-table thead,
		.invitations-table thead {
			display: none;
		}

		.members-table td,
		.invitations-table td {
			display: block;
			text-align: right;
			padding: 0.5rem 1rem;
		}

		.members-table td:first-child,
		.invitations-table td:first-child {
			padding-top: 1rem;
		}

		.members-table td:last-child,
		.invitations-table td:last-child {
			padding-bottom: 1rem;
		}

		.members-table td::before,
		.invitations-table td::before {
			content: attr(data-label);
			float: left;
			font-weight: 600;
		}

		.members-table tr,
		.invitations-table tr {
			display: block;
			margin-bottom: 1rem;
			border: 1px solid var(--color-border);
			border-radius: 8px;
		}

		.action-buttons {
			justify-content: flex-end;
		}
	}
</style>
