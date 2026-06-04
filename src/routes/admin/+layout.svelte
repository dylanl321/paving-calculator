<script lang="ts">
	import type { LayoutData } from './$types';
	import AdminShell from '$lib/components/admin/AdminShell.svelte';

	let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<AdminShell
	isGlobalAdmin={data.isGlobalAdmin}
	isOrgAdmin={data.isOrgAdmin}
	orgName={data.orgName}
	{children}
/>
