<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Administration</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-10">
	<h1 class="text-xl font-semibold tracking-tight">Signed in as {data.user.name}</h1>
	<p class="mt-2 text-sm text-muted-foreground">
		Add and edit the confirmed detections shown on the public map.
	</p>
	<div class="mt-6 flex gap-3">
		<Button href={resolve('/admin/incidents')}>Manage detections</Button>
		<Button href={resolve('/admin/incidents/new')} variant="secondary">Add detection</Button>
	</div>
</main>
