<script lang="ts">
	import AppHeader from '$lib/components/shell/AppHeader.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<div class="min-h-[calc(100dvh-var(--brand-bar-h))]">
	<AppHeader />
	{@render children()}
</div>
