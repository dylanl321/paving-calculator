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

	type MemberActivity = {
		action: string;
		resource_type: string;
		created_at: number;
	} | null;

	let members = $state<Member[]>([]);
	let invitations = $state<Invitation[]>([]);
	let memberActivity = $state<Record<string, MemberActivity>>({});
	let loading = $state(true);
	let error = $state('');
	let showInviteModal = $state(false);
	let inviteForm = $state({ email: '', role: 'member' });
	let inviting = $state(false);
	let resending = $state(false);
	let revokingId = $state<string | null>(null);
	let resendingId = $state<string | null>(null);
	let currentUserId = $state<string | null>(null);
	let currentUserRole = $state<string | null>(null);
	let searchQuery = $state('');
	let roleFilter = $state<string>('all');
	let sortOrder = $state<string>('name-asc');
	let roleChangeConfirm = $state<{ member: Member; newRole: string } | null>(null);

	const filteredMembers = $derived.by(() => {
		const q = searchQuery.toLowerCase();
		let result = members.filter((m) => {
			const matchesSearch =
				!q ||
				m.user_name.toLowerCase().includes(q) ||
				m.user_email.toLowerCase().includes(q);
			const matchesRole = roleFilter === 'all' || m.role === roleFilter;
			return matchesSearch && matchesRole;
		});

		switch (sortOrder) {
			case 'name-asc':
				result = result.slice().sort((a, b) => a.user_name.localeCompare(b.user_name));
				break;
			case 'name-desc':
				result = result.slice().sort((a, b) => b.user_name.localeCompare(a.user_name));
				break;
			case 'newest':
				result = result.slice().sort((a, b) => b.invited_at - a.invited_at);
				break;
			case 'oldest':
				result = result.slice().sort((a, b) => a.invited_at - b.invited_at);
				break;
		}

		return result;
	});

	const hasActiveFilters = $derived(searchQuery !== '' || roleFilter !== 'all');

	function clearFilters() {
		searchQuery = '';
		roleFilter = 'all';
	}

	const roleCounts = $derived(
		Object.fromEntries(
			['all', 'owner', 'admin', 'member'].map((r) => [
				r,
				r === 'all' ? members.length : members.filter((m) => m.role === r).length
			])
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
			const [membersRes, invitesRes, activityRes] = await Promise.all([
				fetch('/api/org'),
				fetch('/api/org/invite'),
				fetch('/api/org/activity')
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

			if (activityRes.ok) {
				const activityData = await activityRes.json();
				memberActivity = activityData.activity || {};
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
		revokingId = invite.id;
		try {
			const res = await fetch(`/api/org/invite/${invite.id}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const data = await res.json();
				toastStore.error(data.error || 'Failed to revoke invitation');
				return;
			}

			await loadTeam();
			toastStore.success(`Invitation for ${invite.email} revoked`);
		} catch (e) {
			toastStore.error('Failed to revoke invitation');
		} finally {
			revokingId = null;
		}
	}

	async function resendInvitation(invite: Invitation) {
		if (resending) return;

		resendingId = invite.id;
		resending = true;
		try {
			const res = await fetch(`/api/org/invite/${invite.id}`, {
				method: 'POST'
			});

			if (!res.ok) {
				const data = await res.json();
				toastStore.error(data.error || 'Failed to resend invitation');
				return;
			}

			await loadTeam();
			toastStore.success(`Invitation resent to ${invite.email}`);
		} catch (e) {
			toastStore.error('Failed to resend invitation');
		} finally {
			resendingId = null;
			resending = false;
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

	function formatRelativeTime(timestamp: number): string {
		const now = Math.floor(Date.now() / 1000);
		const diff = now - timestamp;

		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
		if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
		return formatDate(timestamp);
	}

	function formatActivityLabel(activity: MemberActivity): string {
		if (!activity) return '';

		const { action, resource_type } = activity;

		if (action === 'ran calc') {
			const calcLabels: Record<string, string> = {
				spread_rate: 'spread rate calc',
				feet_left: 'feet left calc',
				tonnage: 'tonnage calc',
				tack_rate: 'tack rate calc',
				stick_check: 'stick check calc'
			};
			return `ran ${calcLabels[resource_type] || resource_type}`;
		}

		if (action === 'logged day') {
			return 'logged a day';
		}

		if (action === 'created' || action === 'updated' || action === 'deleted') {
			const resourceLabels: Record<string, string> = {
				job_site: 'job site',
				calculation: 'calculation',
				daily_log: 'daily log',
				org_member: 'team member',
				org_settings: 'org settings',
				user: 'profile'
			};
			return `${action} ${resourceLabels[resource_type] || resource_type}`;
		}

		return `${action} ${resource_type}`;
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
				<div class="filter-bar">
					<input
						type="search"
						class="search-input"
						placeholder="Search by name or email..."
						bind:value={searchQuery}
					/>
					<div class="role-filter-pills">
						{#each ['all', 'owner', 'admin', 'member'] as role}
							<button
								type="button"
								class="pill {roleFilter === role ? 'pill-active' : ''}"
								onclick={() => (roleFilter = role)}
								aria-pressed={roleFilter === role}
							>
								{role === 'all' ? 'All' : role.charAt(0).toUpperCase() + role.slice(1)}
								<span class="pill-count">{roleCounts[role]}</span>
							</button>
						{/each}
					</div>
					<select class="sort-select" bind:value={sortOrder} aria-label="Sort members">
						<option value="name-asc">Name A-Z</option>
						<option value="name-desc">Name Z-A</option>
						<option value="newest">Newest first</option>
						<option value="oldest">Oldest first</option>
					</select>
				</div>
			</div>
			{#if hasActiveFilters}
				<div class="filter-status">
					<span class="filter-count">
						{filteredMembers.length} of {members.length} member{members.length !== 1 ? 's' : ''}
					</span>
					<button type="button" class="btn-clear-filters" onclick={clearFilters}>
						Clear filters
					</button>
				</div>
			{/if}
			{#if filteredMembers.length === 0}
				<p class="empty">{hasActiveFilters ? 'No members match your filters' : 'No team members yet'}</p>
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
											<option value="owner">Owner</option>
											<option value="admin">Admin</option>
											<option value="member">Member</option>
											<option value="foreman">Foreman</option>
											<option value="operator">Operator</option>
											<option value="inspector">Inspector</option>
											<option value="office">Office</option>
										</select>
									{:else}
										<span class="role-badge {member.role}">{member.role}</span>
									{/if}
								</div>
								<div class="card-row">
									<span class="label">Last Active</span>
									{#if memberActivity[member.user_id]}
										<div class="activity-info">
											<span class="activity-label">{formatActivityLabel(memberActivity[member.user_id])}</span>
											<span class="activity-time">{formatRelativeTime(memberActivity[member.user_id]!.created_at)}</span>
										</div>
									{:else}
										<span class="activity-none">No activity yet</span>
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
								<span class="role-badge {invite.role}">{invite.role}</span>
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
											<button
												class="btn-secondary"
												onclick={() => resendInvitation(invite)}
												disabled={resendingId === invite.id || revokingId === invite.id}
											>
												{resendingId === invite.id ? 'Resending...' : 'Resend'}
											</button>
											<button
												class="btn-danger"
												onclick={() => revokeInvitation(invite)}
												disabled={resendingId === invite.id || revokingId === invite.id}
											>
												{revokingId === invite.id ? 'Revoking...' : 'Revoke'}
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
					<option value="owner">Owner</option>
					<option value="admin">Admin</option>
					<option value="member">Member</option>
					<option value="foreman">Foreman</option>
					<option value="operator">Operator</option>
					<option value="inspector">Inspector</option>
					<option value="office">Office</option>
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
			<strong>{roleChangeConfirm.member.role.charAt(0).toUpperCase() + roleChangeConfirm.member.role.slice(1)}</strong> to
			<strong>{roleChangeConfirm.newRole.charAt(0).toUpperCase() + roleChangeConfirm.newRole.slice(1)}</strong>?
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

	.filter-bar {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		width: 100%;
	}

	.role-filter-pills {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		min-height: 36px;
		border: 1px solid var(--border);
		border-radius: var(--radius-full, 999px);
		background: var(--surface);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		cursor: pointer;
		transition:
			background 0.1s,
			color 0.1s,
			border-color 0.1s;
	}

	.pill:hover {
		background: var(--surface-alt);
		color: var(--text);
	}

	.pill-active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.pill-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 var(--sp-1);
		background: rgba(0, 0, 0, 0.15);
		border-radius: var(--radius-full, 999px);
		font-size: 0.7rem;
		font-weight: var(--fw-bold);
	}

	.pill-active .pill-count {
		background: rgba(0, 0, 0, 0.2);
	}

	.sort-select {
		padding: var(--sp-2) var(--sp-3);
		min-height: 40px;
		font-size: var(--fs-sm);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
		align-self: flex-start;
	}

	.filter-status {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface-alt);
		border-radius: var(--radius-sm);
		font-size: var(--fs-sm);
	}

	.filter-count {
		color: var(--text-muted);
		flex: 1;
	}

	.btn-clear-filters {
		padding: var(--sp-1) var(--sp-3);
		min-height: 32px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font-size: var(--fs-sm);
		cursor: pointer;
		white-space: nowrap;
	}

	.btn-clear-filters:hover {
		background: var(--surface);
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

	.role-badge.admin {
		background: rgba(59, 130, 246, 0.2);
		color: rgb(59, 130, 246);
	}

	.role-badge.foreman {
		background: rgba(245, 158, 11, 0.2);
		color: rgb(245, 158, 11);
	}

	.role-badge.operator {
		background: rgba(34, 197, 94, 0.2);
		color: rgb(34, 197, 94);
	}

	.role-badge.inspector {
		background: rgba(168, 85, 247, 0.2);
		color: rgb(168, 85, 247);
	}

	.role-badge.office {
		background: rgba(20, 184, 166, 0.2);
		color: rgb(20, 184, 166);
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

	.activity-info {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--sp-1);
	}

	.activity-label {
		font-size: var(--fs-sm);
		color: var(--text);
	}

	.activity-time {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.activity-none {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		font-style: italic;
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
			align-items: flex-start;
			justify-content: space-between;
			gap: var(--sp-4);
		}

		.section-header h2 {
			white-space: nowrap;
			padding-top: var(--sp-2);
		}

		.filter-bar {
			max-width: 480px;
		}

		.search-input {
			max-width: 350px;
		}

		.card-actions .btn-danger {
			width: auto;
		}
	}
</style>
