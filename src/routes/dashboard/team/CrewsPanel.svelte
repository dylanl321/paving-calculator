<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/utils/api-error';
	import { toastStore } from '$lib/stores/toast.svelte';

	type Member = { user_id: string; user_name: string; user_email: string; role: string };
	type CrewMember = { user_id: string; name?: string; email?: string };
	type Crew = {
		id: string;
		name: string;
		color: string;
		members: CrewMember[];
	};

	let {
		members,
		canManage
	}: {
		members: Member[];
		canManage: boolean;
	} = $props();

	const COLORS = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'];

	let crews = $state<Crew[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let showCreate = $state(false);
	let crewName = $state('');
	let crewColor = $state('slate');
	let creating = $state(false);
	let picks = $state<Record<string, string>>({});

	const memberById = $derived(new Map(members.map((m) => [m.user_id, m])));

	onMount(() => {
		void loadCrews();
	});

	async function loadCrews() {
		loading = true;
		loadError = '';
		try {
			const data = await api.get<{ crews?: Crew[] }>('/api/org/crews');
			crews = data.crews ?? [];
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Could not load crews';
		} finally {
			loading = false;
		}
	}

	async function createCrew(event: Event) {
		event.preventDefault();
		const name = crewName.trim();
		if (!name || creating) return;
		creating = true;
		try {
			await api.post('/api/org/crews', { name, color: crewColor });
			crewName = '';
			crewColor = 'slate';
			showCreate = false;
			toastStore.success('Crew created');
			await loadCrews();
		} catch {
			// api.post shows the error toast
		} finally {
			creating = false;
		}
	}

	async function addMember(crewId: string) {
		const userId = picks[crewId];
		if (!userId) return;
		try {
			await api.patch(`/api/org/members/${userId}/crew`, { crew_id: crewId });
			picks = { ...picks, [crewId]: '' };
			toastStore.success('Added to crew');
			await loadCrews();
		} catch {
			// toast from api
		}
	}

	async function removeMember(userId: string) {
		try {
			await api.patch(`/api/org/members/${userId}/crew`, { crew_id: null });
			toastStore.success('Removed from crew');
			await loadCrews();
		} catch {
			// toast from api
		}
	}

	function memberLabel(member: CrewMember): string {
		return member.name || memberById.get(member.user_id)?.user_name || member.email || 'Member';
	}
</script>

<section class="crews">
	<div class="head">
		<div>
			<h2>Crews</h2>
			<p>People on a crew see the projects that crew is assigned to. Each person is on one crew.</p>
		</div>
		{#if canManage}
			<button type="button" class="primary" onclick={() => (showCreate = !showCreate)}>
				{showCreate ? 'Cancel' : 'New crew'}
			</button>
		{/if}
	</div>

	{#if showCreate && canManage}
		<form class="create" onsubmit={createCrew}>
			<label>
				Crew name
				<input bind:value={crewName} maxlength="80" required placeholder="Day crew" />
			</label>
			<label>
				Color
				<select bind:value={crewColor}>
					{#each COLORS as color}
						<option value={color}>{color}</option>
					{/each}
				</select>
			</label>
			<button type="submit" class="primary" disabled={creating}>
				{creating ? 'Creating…' : 'Create crew'}
			</button>
		</form>
	{/if}

	{#if loading}
		<p class="muted">Loading crews…</p>
	{:else if loadError}
		<p class="error">{loadError}</p>
	{:else if crews.length === 0}
		<p class="muted">No crews yet. Create one, add people, then assign it on a project.</p>
	{:else}
		<div class="list">
			{#each crews as crew (crew.id)}
				<article class="card">
					<h3>
						<span class="dot" data-color={crew.color}></span>
						{crew.name}
					</h3>
					{#if crew.members.length === 0}
						<p class="muted">No one on this crew yet.</p>
					{:else}
						<ul>
							{#each crew.members as member (member.user_id)}
								<li>
									<span>{memberLabel(member)}</span>
									{#if canManage}
										<button type="button" onclick={() => removeMember(member.user_id)}>Remove</button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
					{#if canManage}
						<div class="add">
							<label class="sr" for="add-{crew.id}">Add a team member to {crew.name}</label>
							<select id="add-{crew.id}" bind:value={picks[crew.id]}>
								<option value="">Add a person…</option>
								{#each members as member (member.user_id)}
									<option value={member.user_id}>{member.user_name}</option>
								{/each}
							</select>
							<button type="button" onclick={() => addMember(crew.id)} disabled={!picks[crew.id]}>
								Add
							</button>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</section>

<style>
	.crews {
		margin-top: var(--sp-8, 40px);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	h2 {
		margin: 0 0 var(--sp-1, 4px);
	}

	.head p,
	.muted {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.error {
		color: var(--danger, #b42318);
	}

	.create,
	.add {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		align-items: flex-end;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
	}

	input,
	select,
	button {
		min-height: 48px;
		border-radius: var(--radius-md);
		font: inherit;
	}

	input,
	select {
		padding: 0 var(--sp-3);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		min-width: 180px;
	}

	button {
		padding: 0 var(--sp-4);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
	}

	.primary {
		background: var(--accent);
		color: var(--accent-text);
		border-color: transparent;
	}

	.list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: var(--sp-3);
	}

	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		padding: var(--sp-4);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	h3 {
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--accent);
		flex-shrink: 0;
	}

	.dot[data-color='red'] { background: #e11d48; }
	.dot[data-color='orange'] { background: #ea580c; }
	.dot[data-color='amber'] { background: #d97706; }
	.dot[data-color='green'] { background: #16a34a; }
	.dot[data-color='teal'] { background: #0d9488; }
	.dot[data-color='blue'] { background: #2563eb; }
	.dot[data-color='violet'] { background: #7c3aed; }
	.dot[data-color='pink'] { background: #db2777; }
	.dot[data-color='slate'] { background: #64748b; }

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-2);
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
