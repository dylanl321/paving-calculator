<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toastStore } from '$lib/stores/toast';

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
	let currentUserId = $state<string | null>(null);
	let currentUserRole = $state<string | null>(null);
	let searchQuery = $state('');
	let roleChangeConfirm = $state<{ member: Member; newRole: string } | null>(null);

	const filteredMembers = $derived(
		members.filter(
			(m) =>
				m.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				m.user_email.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

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
				toastStore.error(data.error || 'Failed to send invitation');
				return;
			}

			await loadTeam();
			showInviteModal = false;
			inviteForm = { email: '', role: 'member' };
			toastStore.success('Invitation sent successfully');
		} catch (e) {
			toastStore.error('Failed to send invitation');
		} finally {
			inviting = false;
		}
	}

	function requestRoleChange(member: Member, newRole: string) {
		if (newRole === member.role) return;
		roleChangeConfirm = { member, newRole };
	}

	async function confirmRoleChange() {
		if (!roleChangeConfirm) return;

		const { member, newRole } = roleChangeConfirm;

		try {
			const res = await fetch(`/api/org/members/${member.user_id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: newRole })
			});

			if (!res.ok) {
				const data = await res.json();
				toastStore.error(data.error || 'Failed to update role');
				return;
			}

			await loadTeam();
			roleChangeConfirm = null;
			toastStore.success('Role updated successfully');
		} catch (e) {
			toastStore.error('Failed to update role');
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
				toastStore.error(data.error || 'Failed to remove member');
				return;
			}

			await loadTeam();
			toastStore.success('Member removed successfully');
		} catch (e) {
			toastStore.error('Failed to remove member');
		}
	}

	async function revokeInvitation(invite: Invitation) {
		if (!confirm(`Revoke invitation for ${invite.email}?`)) return;

		try {
			const res = await fetch(`/api/org/invite/${invite.id}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const data = await res.json();
				alert(data.error || 'Failed to revoke invitation');
				return;
			}

			await loadTeam();
		} catch (e) {
			alert('Failed to revoke invitation');
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

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
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
			<div class="section-header">
				<h2>Team Members ({members.length})</h2>
				<input
					type="search"
					class="search-input"
					placeholder="Search by name or email..."
					bind:value={searchQuery}
				/>
			</div>
			{#if filteredMembers.length === 0}
				<p class="empty">{searchQuery ? 'No members found' : 'No team members yet'}</p>
			{:else}
				<div class="members-cards">
					{#each filteredMembers as member}
						<div class="member-card">
							<div class="card-header">
								<div class="avatar">{getInitials(member.user_name)}</div>
								<div class="member-info">
									<div class="member-name">{member.user_name}</div>
									<div class="member-email">{member.user_email}</div>
								</div>
							</div>
							<div class="card-body">
								<div class="card-row">
									<span class="label">Role</span>
									{#if canModifyMember(member)}
										<select
											class="role-select"
											value={member.role}
											onchange={(e) => requestRoleChange(member, e.currentTarget.value)}
										>
											<option value="member">Member</option>
											<option value="admin">Admin</option>
											<option value="owner">Owner</option>
										</select>
									{:else}
										<span class="role-badge owner">{member.role}</span>
									{/if}
								</div>
								<div class="card-row">
									<span class="label">Joined</span>
									<span>{formatDate(member.invited_at)}</span>
								</div>
							</div>
							{#if canModifyMember(member)}
								<div class="card-actions">
									<button class="btn-danger" onclick={() => removeMember(member)}>
										Remove Member
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>

		{#if invitations.length > 0}
			<section class="invitations-section">
				<h2>Pending Invitations ({invitations.length})</h2>

				<div class="invitations-cards">
					{#each invitations as invite}
						<div class="invitation-card">
							<div class="card-header">
								<div class="invitation-email">{invite.email}</div>
								<span class="role-badge">{invite.role}</span>
							</div>
							<div class="card-body">
								<div class="card-row">
									<span class="label">Invited By</span>
									<span>{invite.invited_by_name}</span>
								</div>
								<div class="card-row">
									<span class="label">Sent</span>
									<span>{formatDate(invite.created_at)}</span>
								</div>
								<div class="card-row">
									<span class="label">Expires</span>
									<span>{formatDate(invite.expires_at)}</span>
								</div>
							</div>
							<div class="card-actions">
								<button class="btn-danger" onclick={() => revokeInvitation(invite)}>
									Revoke Invitation
								</button>
							</div>
						</div>
					{/each}
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

{#if roleChangeConfirm}
	<div class="modal-overlay" onclick={() => (roleChangeConfirm = null)}></div>
	<div class="modal confirm-dialog">
		<h2>Confirm Role Change</h2>
		<p class="confirm-message">
			Change <strong>{roleChangeConfirm.member.user_name}</strong>'s role from
			<strong>{roleChangeConfirm.member.role}</strong> to
			<strong>{roleChangeConfirm.newRole}</strong>?
		</p>
		<div class="modal-actions">
			<button type="button" onclick={() => (roleChangeConfirm = null)}>Cancel</button>
			<button type="button" class="btn-primary" onclick={confirmRoleChange}>Confirm</button>
		</div>
	</div>
{/if}

<style>
	.team-page {
		padding: var(--sp-4);
		max-width: 1400px;
		margin: 0 auto;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-4);
		margin-bottom: var(--sp-6);
		border-bottom: 2px solid var(--border);
		padding-bottom: var(--sp-4);
	}

	h1 {
		font-size: var(--fs-xl);
		margin: 0;
		color: var(--text);
	}

	h2 {
		font-size: var(--fs-lg);
		margin: 0 0 var(--sp-4) 0;
		color: var(--text);
	}

	.actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.actions a,
	.actions button {
		padding: 0 var(--sp-5);
		min-height: var(--touch);
		display: flex;
		align-items: center;
		text-decoration: none;
		border-radius: var(--radius-sm);
		border: none;
		font-size: var(--fs-md);
		cursor: pointer;
	}

	.actions a {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
	}

	.actions button {
		background: var(--accent);
		color: var(--accent-text);
	}

	.actions a:hover,
	.actions button:hover {
		opacity: 0.9;
	}

	.loading,
	.error,
	.empty {
		text-align: center;
		padding: var(--sp-8);
		font-size: var(--fs-lg);
	}

	.error {
		color: var(--bad);
		background: var(--surface);
		border-radius: var(--radius-md);
	}

	section {
		background: var(--surface);
		padding: var(--sp-6);
		border-radius: var(--radius-md);
		margin-bottom: var(--sp-6);
	}

	.section-header {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		margin-bottom: var(--sp-6);
	}

	.search-input {
		width: 100%;
		padding: var(--sp-3);
		font-size: var(--fs-md);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		min-height: var(--touch);
	}

	.search-input::placeholder {
		color: var(--text-muted);
	}

	.role-badge {
		display: inline-block;
		padding: var(--sp-1) var(--sp-3);
		background: var(--surface-alt);
		color: var(--text);
		border-radius: var(--radius-sm);
		font-size: var(--fs-sm);
		text-transform: capitalize;
	}

	.role-badge.owner {
		background: rgba(249, 115, 22, 0.2);
		color: rgb(249, 115, 22);
	}

	.role-select {
		padding: var(--sp-2) var(--sp-3);
		min-height: 40px;
		font-size: var(--fs-sm);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		cursor: pointer;
	}

	.btn-danger {
		padding: var(--sp-2) var(--sp-4);
		min-height: var(--touch);
		background: var(--bad);
		color: white;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
	}

	.btn-danger:hover {
		opacity: 0.9;
	}

	.btn-sm {
		min-height: 40px;
		padding: var(--sp-2) var(--sp-3);
	}

	.no-actions {
		color: var(--text-muted);
		font-size: 1.25rem;
	}

	/* Card grid — responsive, primary layout for all screen sizes */
	.members-cards,
	.invitations-cards {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--sp-4);
	}

	@media (min-width: 600px) {
		.members-cards,
		.invitations-cards {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 900px) {
		.members-cards,
		.invitations-cards {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	.member-card,
	.invitation-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-5);
		box-shadow: var(--shadow-sm);
		transition: box-shadow 0.15s var(--ease);
	}

	.member-card:hover,
	.invitation-card:hover {
		box-shadow: var(--shadow-md);
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
		padding-bottom: var(--sp-4);
		border-bottom: 1px solid var(--border);
	}

	.avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-text);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: var(--fw-bold);
		font-size: var(--fs-md);
		flex-shrink: 0;
	}

	.member-info {
		flex: 1;
		min-width: 0;
	}

	.member-name {
		font-weight: var(--fw-semibold);
		font-size: var(--fs-md);
		color: var(--text);
		margin-bottom: var(--sp-1);
	}

	.member-email {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.invitation-email {
		font-weight: var(--fw-semibold);
		font-size: var(--fs-md);
		color: var(--text);
		flex: 1;
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
	}

	.card-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-4);
	}

	.card-row .label {
		font-weight: var(--fw-semibold);
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.card-row select {
		flex: 1;
		max-width: 150px;
	}

	.card-actions {
		display: flex;
		justify-content: flex-end;
	}

	.card-actions .btn-danger {
		width: 100%;
	}

	/* Modal styles */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 100;
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--bg);
		padding: var(--sp-8);
		border-radius: var(--radius-md);
		z-index: 101;
		min-width: 300px;
		max-width: 500px;
		width: 90%;
		border: 1px solid var(--border);
	}

	.modal h2 {
		margin: 0 0 var(--sp-6) 0;
		color: var(--text);
		font-size: var(--fs-xl);
	}

	.modal label {
		display: block;
		margin-bottom: var(--sp-4);
		color: var(--text);
		font-weight: var(--fw-medium);
	}

	.modal input,
	.modal select {
		display: block;
		width: 100%;
		margin-top: var(--sp-2);
		padding: var(--sp-3);
		font-size: var(--fs-md);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		min-height: var(--touch);
	}

	.confirm-message {
		margin: 0 0 var(--sp-6) 0;
		color: var(--text);
		font-size: var(--fs-md);
		line-height: 1.6;
	}

	.confirm-message strong {
		color: var(--accent);
		font-weight: var(--fw-semibold);
	}

	.modal-actions {
		display: flex;
		gap: var(--sp-3);
		justify-content: flex-end;
		margin-top: var(--sp-6);
	}

	.modal-actions button {
		padding: 0 var(--sp-6);
		min-height: var(--touch);
		border: none;
		border-radius: var(--radius-sm);
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		cursor: pointer;
	}

	.modal-actions button[type='button']:not(.btn-primary) {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
	}

	.modal-actions button[type='submit'],
	.modal-actions button.btn-primary {
		background: var(--accent);
		color: var(--accent-text);
	}

	.modal-actions button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Responsive breakpoint */
	@media (max-width: 767px) {
		.section-header {
			gap: var(--sp-3);
		}

		h1 {
			font-size: var(--fs-lg);
		}

		h2 {
			font-size: var(--fs-md);
		}
	}

	@media (min-width: 768px) {
		.section-header {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}

		.search-input {
			max-width: 350px;
		}

		.card-actions .btn-danger {
			width: auto;
		}
	}
</style>
