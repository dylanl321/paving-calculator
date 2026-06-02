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

	type Crew = {
		id: string;
		name: string;
		color: string;
		member_count: number;
		members: Array<{ user_id: string; user_name: string }>;
	};

	let members = $state<Member[]>([]);
	let invitations = $state<Invitation[]>([]);
	let memberActivity = $state<Record<string, MemberActivity>>({});
	let crews = $state<Crew[]>([]);
	let memberCrews = $state<Record<string, string | null>>({});
	let loading = $state(true);
	let error = $state('');
	let showInviteModal = $state(false);
	let inviteForm = $state({ emails: [] as string[], role: 'member' });
	let emailInput = $state('');
	let inviting = $state(false);
	let resending = $state(false);
	let currentUserId = $state<string | null>(null);
	let currentUserRole = $state<string | null>(null);
	let searchQuery = $state('');
	let roleFilter = $state<string>('all');
	let crewFilter = $state<string>('all');
	let sortOrder = $state<string>('name-asc');
	let roleChangeConfirm = $state<{ member: Member; newRole: string } | null>(null);
	let showNewCrewForm = $state(false);
	let newCrewForm = $state({ name: '', color: 'slate' });
	let creatingCrew = $state(false);

	const filteredMembers = $derived.by(() => {
		const q = searchQuery.toLowerCase();
		let result = members.filter((m) => {
			const matchesSearch =
				!q ||
				m.user_name.toLowerCase().includes(q) ||
				m.user_email.toLowerCase().includes(q);
			const matchesRole = roleFilter === 'all' || m.role === roleFilter;
			const matchesCrew =
				crewFilter === 'all' ||
				(crewFilter === 'none' ? !memberCrews[m.user_id] : memberCrews[m.user_id] === crewFilter);
			return matchesSearch && matchesRole && matchesCrew;
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

	const hasActiveFilters = $derived(searchQuery !== '' || roleFilter !== 'all' || crewFilter !== 'all');

	function clearFilters() {
		searchQuery = '';
		roleFilter = 'all';
		crewFilter = 'all';
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
			const [membersRes, invitesRes, activityRes, crewsRes] = await Promise.all([
				fetch('/api/org'),
				fetch('/api/org/invite'),
				fetch('/api/org/activity'),
				fetch('/api/org/crews')
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

			if (crewsRes.ok) {
				const crewsData = await crewsRes.json();
				crews = crewsData.crews || [];

				// Build memberCrews map
				const crewMap: Record<string, string | null> = {};
				for (const crew of crews) {
					for (const member of crew.members) {
						crewMap[member.user_id] = crew.id;
					}
				}
				memberCrews = crewMap;
			}
		} catch (e) {
			error = 'Failed to load team';
		} finally {
			loading = false;
		}
	}

	function addEmail() {
		const email = emailInput.trim();
		if (!email) return;

		// Basic email validation
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			toastStore.error('Invalid email address');
			return;
		}

		// Check for duplicates
		if (inviteForm.emails.includes(email)) {
			toastStore.error('Email already added');
			return;
		}

		inviteForm.emails = [...inviteForm.emails, email];
		emailInput = '';
	}

	function removeEmail(email: string) {
		inviteForm.emails = inviteForm.emails.filter(e => e !== email);
	}

	function handleEmailKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			addEmail();
		}
	}

	async function sendInvite() {
		// Add pending email if valid
		if (emailInput.trim()) {
			addEmail();
		}

		if (inviteForm.emails.length === 0) return;

		inviting = true;
		let successCount = 0;
		let failCount = 0;

		try {
			// Send one POST per email
			for (const email of inviteForm.emails) {
				try {
					const res = await fetch('/api/org/invite', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							email: email,
							role: inviteForm.role
						})
					});

					if (res.ok) {
						successCount++;
					} else {
						failCount++;
						const data = await res.json();
						toastStore.error(`Failed to invite ${email}: ${data.error || 'Unknown error'}`);
					}
				} catch (e) {
					failCount++;
					toastStore.error(`Failed to invite ${email}`);
				}
			}

			await loadTeam();
			showInviteModal = false;
			inviteForm = { emails: [], role: 'member' };
			emailInput = '';

			if (successCount > 0) {
				toastStore.success(`${successCount} invitation${successCount > 1 ? 's' : ''} sent successfully`);
			}
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
				toastStore.error(data.error || 'Failed to revoke invitation');
				return;
			}

			await loadTeam();
			toastStore.success('Invitation revoked successfully');
		} catch (e) {
			toastStore.error('Failed to revoke invitation');
		}
	}

	async function resendInvitation(invite: Invitation) {
		if (resending) return;

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
			toastStore.success('Invitation resent successfully');
		} catch (e) {
			toastStore.error('Failed to resend invitation');
		} finally {
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

	const isAdmin = $derived(currentUserRole === 'owner' || currentUserRole === 'admin');

	const CREW_COLORS: Record<string, string> = {
		slate: '#64748b',
		red: '#ef4444',
		orange: '#f97316',
		amber: '#f59e0b',
		green: '#22c55e',
		teal: '#14b8a6',
		blue: '#3b82f6',
		violet: '#8b5cf6',
		pink: '#ec4899'
	};

	async function createCrew() {
		if (!newCrewForm.name.trim()) return;

		creatingCrew = true;
		try {
			const res = await fetch('/api/org/crews', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newCrewForm.name.trim(),
					color: newCrewForm.color
				})
			});

			if (!res.ok) {
				const data = await res.json();
				toastStore.error(data.error || 'Failed to create crew');
				return;
			}

			await loadTeam();
			showNewCrewForm = false;
			newCrewForm = { name: '', color: 'slate' };
			toastStore.success('Crew created successfully');
		} catch (e) {
			toastStore.error('Failed to create crew');
		} finally {
			creatingCrew = false;
		}
	}

	async function deleteCrew(crewId: string, crewName: string) {
		if (!confirm(`Delete "${crewName}" crew? Members will be unassigned.`)) return;

		try {
			const res = await fetch(`/api/org/crews/${crewId}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const data = await res.json();
				toastStore.error(data.error || 'Failed to delete crew');
				return;
			}

			await loadTeam();
			toastStore.success('Crew deleted successfully');
		} catch (e) {
			toastStore.error('Failed to delete crew');
		}
	}

	async function updateMemberCrew(userId: string, crewId: string | null) {
		try {
			const res = await fetch(`/api/org/members/${userId}/crew`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ crew_id: crewId })
			});

			if (!res.ok) {
				const data = await res.json();
				toastStore.error(data.error || 'Failed to update crew assignment');
				return;
			}

			await loadTeam();
			toastStore.success('Crew assignment updated');
		} catch (e) {
			toastStore.error('Failed to update crew assignment');
		}
	}

	function getCrewById(crewId: string | null): Crew | null {
		if (!crewId) return null;
		return crews.find((c) => c.id === crewId) || null;
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
		{#if isAdmin}
			<section class="crews-section">
				<div class="section-header">
					<h2>Crews ({crews.length})</h2>
					{#if !showNewCrewForm}
						<button class="btn-new-crew" onclick={() => (showNewCrewForm = true)}>+ New Crew</button>
					{/if}
				</div>

				{#if showNewCrewForm}
					<div class="new-crew-form">
						<input
							type="text"
							class="crew-name-input"
							placeholder="Crew name (e.g., Alpha Crew)"
							bind:value={newCrewForm.name}
							maxlength="50"
							autofocus
						/>
						<div class="color-picker">
							{#each Object.keys(CREW_COLORS) as colorName}
								<button
									type="button"
									class="color-option {newCrewForm.color === colorName ? 'color-option-active' : ''}"
									style="background-color: {CREW_COLORS[colorName]};"
									onclick={() => (newCrewForm.color = colorName)}
									aria-label={colorName}
								></button>
							{/each}
						</div>
						<div class="form-actions">
							<button
								type="button"
								class="btn-secondary"
								onclick={() => {
									showNewCrewForm = false;
									newCrewForm = { name: '', color: 'slate' };
								}}
							>
								Cancel
							</button>
							<button
								type="button"
								class="btn-primary"
								onclick={createCrew}
								disabled={creatingCrew || !newCrewForm.name.trim()}
							>
								{creatingCrew ? 'Creating...' : 'Create Crew'}
							</button>
						</div>
					</div>
				{/if}

				{#if crews.length === 0}
					<p class="empty">No crews yet. Create one to organize your team.</p>
				{:else}
					<div class="crews-list">
						{#each crews as crew}
							<div class="crew-card">
								<div class="crew-header">
									<span
										class="crew-badge"
										style="background-color: {CREW_COLORS[crew.color]}; color: white;"
									>
										{crew.name}
									</span>
									<span class="crew-count">{crew.member_count} member{crew.member_count !== 1 ? 's' : ''}</span>
								</div>
								<div class="crew-members">
									{#if crew.members.length > 0}
										{#each crew.members.slice(0, 3) as member}
											<div class="crew-member-avatar">{getInitials(member.user_name)}</div>
										{/each}
										{#if crew.members.length > 3}
											<div class="crew-member-more">+{crew.members.length - 3}</div>
										{/if}
									{:else}
										<span class="crew-empty">No members</span>
									{/if}
								</div>
								<button class="btn-delete-crew" onclick={() => deleteCrew(crew.id, crew.name)}>
									Delete
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

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
					{#if crews.length > 0}
						<div class="crew-filter-pills">
							<button
								type="button"
								class="pill {crewFilter === 'all' ? 'pill-active' : ''}"
								onclick={() => (crewFilter = 'all')}
								aria-pressed={crewFilter === 'all'}
							>
								All Crews
							</button>
							<button
								type="button"
								class="pill {crewFilter === 'none' ? 'pill-active' : ''}"
								onclick={() => (crewFilter = 'none')}
								aria-pressed={crewFilter === 'none'}
							>
								No Crew
							</button>
							{#each crews as crew}
								<button
									type="button"
									class="pill pill-crew {crewFilter === crew.id ? 'pill-active' : ''}"
									style="--crew-color: {CREW_COLORS[crew.color]};"
									onclick={() => (crewFilter = crew.id)}
									aria-pressed={crewFilter === crew.id}
								>
									{crew.name}
								</button>
							{/each}
						</div>
					{/if}
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
								{#if crews.length > 0}
									<div class="card-row">
										<span class="label">Crew</span>
										{#if isAdmin}
											<select
												class="crew-select"
												value={memberCrews[member.user_id] || ''}
												onchange={(e) => updateMemberCrew(member.user_id, e.currentTarget.value || null)}
											>
												<option value="">No crew</option>
												{#each crews as crew}
													<option value={crew.id}>{crew.name}</option>
												{/each}
											</select>
										{:else}
											{@const memberCrew = getCrewById(memberCrews[member.user_id])}
											{#if memberCrew}
												<span
													class="crew-badge-inline"
													style="background-color: {CREW_COLORS[memberCrew.color]}; color: white;"
												>
													{memberCrew.name}
												</span>
											{:else}
												<span class="text-muted">No crew</span>
											{/if}
										{/if}
									</div>
								{/if}
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
									disabled={resending}
								>
									{resending ? 'Resending...' : 'Resend'}
								</button>
								<button class="btn-danger" onclick={() => revokeInvitation(invite)}>
									Revoke
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
	<div class="modal invite-modal">
		<div class="modal-header">
			<h2>Invite Team Members</h2>
			<button type="button" class="modal-close" onclick={() => (showInviteModal = false)} aria-label="Close modal">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12"/>
				</svg>
			</button>
		</div>
		<form onsubmit={(e) => { e.preventDefault(); sendInvite(); }}>
			<div class="modal-body">
				<label class="form-label">
					<span class="label-text">Email Addresses</span>
					<div class="email-chips-container">
						{#if inviteForm.emails.length > 0}
							<div class="email-chips">
								{#each inviteForm.emails as email}
									<span class="email-chip">
										<span>{email}</span>
										<button
											type="button"
											class="chip-remove"
											onclick={() => removeEmail(email)}
											aria-label="Remove {email}"
										>
											×
										</button>
									</span>
								{/each}
							</div>
						{/if}
						<input
							type="text"
							class="email-input"
							bind:value={emailInput}
							onkeydown={handleEmailKeydown}
							placeholder="Type email and press Enter"
							autofocus
						/>
					</div>
					{#if inviteForm.emails.length > 0}
						<div class="invite-count">
							{inviteForm.emails.length} invitation{inviteForm.emails.length > 1 ? 's' : ''} will be sent
						</div>
					{/if}
				</label>
				<label class="form-label">
					<span class="label-text">Role</span>
					<select class="role-input" bind:value={inviteForm.role}>
						<option value="owner">Owner</option>
						<option value="admin">Admin</option>
						<option value="member">Member</option>
						<option value="foreman">Foreman</option>
						<option value="operator">Operator</option>
						<option value="inspector">Inspector</option>
						<option value="office">Office</option>
					</select>
				</label>
			</div>
			<div class="modal-footer">
				<button type="button" class="btn-secondary" onclick={() => (showInviteModal = false)}>
					Cancel
				</button>
				<button type="submit" class="btn-primary" disabled={inviting || (inviteForm.emails.length === 0 && !emailInput.trim())}>
					{inviting ? 'Sending...' : `Send ${inviteForm.emails.length > 0 ? inviteForm.emails.length + ' ' : ''}Invite${inviteForm.emails.length !== 1 ? 's' : ''}`}
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

	/* Crew section styles */
	.crews-section {
		background: var(--surface);
		padding: var(--sp-6);
		border-radius: var(--radius-md);
		margin-bottom: var(--sp-6);
	}

	.btn-new-crew {
		padding: 0 var(--sp-5);
		min-height: var(--touch);
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius-sm);
		font-size: var(--fs-md);
		cursor: pointer;
		white-space: nowrap;
	}

	.btn-new-crew:hover {
		opacity: 0.9;
	}

	.new-crew-form {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-5);
		margin-bottom: var(--sp-4);
	}

	.crew-name-input {
		width: 100%;
		padding: var(--sp-3);
		font-size: var(--fs-md);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		min-height: var(--touch);
		margin-bottom: var(--sp-4);
	}

	.color-picker {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		margin-bottom: var(--sp-4);
	}

	.color-option {
		width: 48px;
		height: 48px;
		border-radius: var(--radius-sm);
		border: 3px solid transparent;
		cursor: pointer;
		transition: border-color 0.2s;
	}

	.color-option:hover {
		border-color: rgba(255, 255, 255, 0.3);
	}

	.color-option-active {
		border-color: white !important;
		box-shadow: 0 0 0 2px var(--bg);
	}

	.form-actions {
		display: flex;
		gap: var(--sp-3);
		justify-content: flex-end;
	}

	.btn-secondary {
		padding: 0 var(--sp-5);
		min-height: var(--touch);
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: var(--fs-md);
		cursor: pointer;
	}

	.btn-primary {
		padding: 0 var(--sp-5);
		min-height: var(--touch);
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius-sm);
		font-size: var(--fs-md);
		cursor: pointer;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.crews-list {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--sp-4);
	}

	@media (min-width: 600px) {
		.crews-list {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 900px) {
		.crews-list {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (min-width: 1200px) {
		.crews-list {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.crew-card {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.crew-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.crew-badge {
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		font-weight: var(--fw-semibold);
		font-size: var(--fs-sm);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.crew-count {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		white-space: nowrap;
	}

	.crew-members {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 40px;
	}

	.crew-member-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-text);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: var(--fw-bold);
		font-size: var(--fs-sm);
		flex-shrink: 0;
	}

	.crew-member-more {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--surface-alt);
		color: var(--text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--fs-sm);
		flex-shrink: 0;
	}

	.crew-empty {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		font-style: italic;
	}

	.btn-delete-crew {
		padding: var(--sp-2) var(--sp-3);
		min-height: 40px;
		background: var(--bad);
		color: white;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
	}

	.btn-delete-crew:hover {
		opacity: 0.9;
	}

	.crew-filter-pills {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.pill-crew.pill-active {
		background: var(--crew-color);
		border-color: var(--crew-color);
	}

	.crew-select {
		padding: var(--sp-2) var(--sp-3);
		min-height: 40px;
		font-size: var(--fs-sm);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		cursor: pointer;
		flex: 1;
		max-width: 150px;
	}

	.crew-badge-inline {
		padding: var(--sp-1) var(--sp-3);
		border-radius: var(--radius-sm);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		white-space: nowrap;
	}

	.text-muted {
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-style: italic;
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
		gap: var(--sp-2);
		justify-content: flex-end;
	}

	.card-actions button {
		padding: var(--sp-2) var(--sp-4);
		min-height: var(--touch);
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		flex: 1;
	}

	.card-actions button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.card-actions .btn-secondary {
		background: var(--surface-alt);
		color: var(--text);
		border: 1px solid var(--border);
	}

	.card-actions .btn-secondary:hover:not(:disabled) {
		background: var(--surface);
	}

	.card-actions .btn-danger {
		background: var(--bad);
		color: white;
	}

	.card-actions .btn-danger:hover:not(:disabled) {
		opacity: 0.9;
	}

	/* Modal styles */
	@keyframes modal-in {
		from {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
	}

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
		background: var(--surface);
		border-radius: var(--radius-md);
		z-index: 101;
		min-width: 300px;
		max-width: 500px;
		width: 90%;
		border: 1px solid var(--border);
		box-shadow: var(--shadow-lg);
		border-top: 3px solid var(--accent);
		animation: modal-in 150ms ease;
		padding: var(--sp-8);
	}

	/* Invite modal overrides base padding — it manages its own internal spacing */
	.invite-modal {
		padding: 0;
		max-width: 520px;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-6) var(--sp-6) var(--sp-4) var(--sp-6);
		border-bottom: 1px solid var(--border);
	}

	.modal-header h2 {
		margin: 0;
		color: var(--text);
		font-size: var(--fs-xl);
	}

	.modal-close {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
	}

	.modal-close:hover {
		background: var(--surface-hover, var(--surface-alt));
		color: var(--text);
	}

	.modal-body {
		padding: var(--sp-6) var(--sp-6) var(--sp-5) var(--sp-6);
	}

	.form-label {
		display: block;
		margin-bottom: var(--sp-5);
	}

	.label-text {
		display: block;
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		font-weight: var(--fw-semibold);
		margin-bottom: var(--sp-2);
	}

	.email-chips-container {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		padding: var(--sp-3);
		min-height: var(--touch);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
	}

	.email-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		width: 100%;
	}

	.email-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-1) var(--sp-3);
		background: var(--surface-hover, var(--surface-alt));
		border-radius: var(--radius-pill, 999px);
		font-size: var(--fs-sm);
		color: var(--text);
	}

	.chip-remove {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		background: transparent;
		border: none;
		border-radius: 50%;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 1.25rem;
		line-height: 1;
		transition: background 0.1s, color 0.1s;
	}

	.chip-remove:hover {
		background: rgba(0, 0, 0, 0.2);
		color: var(--text);
	}

	.email-input {
		flex: 1;
		min-width: 200px;
		background: transparent;
		border: none;
		outline: none;
		padding: var(--sp-1);
		font-size: var(--fs-md);
		color: var(--text);
	}

	.email-input::placeholder {
		color: var(--text-muted);
	}

	.invite-count {
		margin-top: var(--sp-2);
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.role-input {
		display: block;
		width: 100%;
		padding: var(--sp-3);
		font-size: var(--fs-md);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		min-height: var(--touch);
		cursor: pointer;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-3);
		padding: var(--sp-5) var(--sp-6) var(--sp-6) var(--sp-6);
		border-top: 1px solid var(--border);
	}

	.btn-secondary {
		padding: 0 var(--sp-6);
		min-height: var(--touch);
		background: transparent;
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		transition: background 0.1s;
	}

	.btn-secondary:hover {
		background: var(--surface-alt);
	}

	.btn-primary {
		padding: 0 var(--sp-6);
		min-height: var(--touch);
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius-sm);
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		transition: opacity 0.1s;
	}

	.btn-primary:hover:not(:disabled) {
		opacity: 0.9;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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
