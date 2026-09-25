<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import BrandBar from '$lib/components/shell/BrandBar.svelte';
	import { theme } from '$lib/state/theme.svelte';

	let { data, children } = $props();

	onMount(() => theme.start());
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<BrandBar signedInAs={data.signedInAs} />
{@render children()}
