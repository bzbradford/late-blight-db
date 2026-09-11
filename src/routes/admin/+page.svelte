<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Administration</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-10">
	<h1 class="text-xl font-semibold tracking-tight">Signed in as {data.user.name}</h1>
	<p class="mt-2 text-sm text-muted-foreground">
		Detection entry and editing are added in the next phase.
	</p>
</main>
