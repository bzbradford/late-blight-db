<script lang="ts">
	import { resolve } from '$app/paths';
	import IncidentForm from '$lib/components/admin/IncidentForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Add detection</title></svelte:head>

<main class="mx-auto max-w-2xl px-4 py-8">
	<a href={resolve('/admin')} class="text-sm text-muted-foreground hover:text-foreground"
		>← All detections</a
	>
	<h1 class="mt-3 mb-6 text-xl font-semibold tracking-tight">Add detection</h1>

	<IncidentForm
		diseases={data.diseases}
		counties={data.counties}
		suggestions={data.suggestions}
		values={form?.values ?? {}}
		errors={form?.errors ?? {}}
		submitLabel="Add detection"
		maxDate={data.maxDate}
		duplicates={form?.duplicates ?? []}
	/>
</main>
