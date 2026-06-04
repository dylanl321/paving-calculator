<script lang="ts">
	import {
		Calculator,
		BookOpen,
		BookMarked,
		LayoutDashboard,
		Clock,
		Upload,
		Users,
		Settings,
		Map,
		ShieldCheck
	} from 'lucide-svelte';

	let { icon }: { icon: string } = $props();
</script>

{#if icon === 'calc'}
	<Calculator size={22} />
{:else if icon === 'book'}
	<BookOpen size={22} />
{:else if icon === 'guide'}
	<BookMarked size={22} />
{:else if icon === 'layout'}
	<LayoutDashboard size={22} />
{:else if icon === 'upload'}
	<Upload size={22} />
{:else if icon === 'clock'}
	<Clock size={22} />
{:else if icon === 'map'}
	<Map size={22} />
{:else if icon === 'users'}
	<Users size={22} />
{:else if icon === 'settings'}
	<Settings size={22} />
{:else if icon === 'shield-check'}
	<ShieldCheck size={22} />
{/if}
