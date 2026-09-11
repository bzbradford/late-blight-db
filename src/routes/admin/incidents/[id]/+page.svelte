<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import IncidentForm from '$lib/components/admin/IncidentForm.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let confirmingRetract = $state(false);
</script>

<svelte:head><title>Edit detection</title></svelte:head>

<main class="mx-auto max-w-2xl px-4 py-8">
	<a href={resolve('/admin/incidents')} class="text-sm text-muted-foreground hover:text-foreground"
		>← All detections</a
	>
	<h1 class="mt-3 text-xl font-semibold tracking-tight">
		{data.incident.countyName}, {data.incident.stateUsps}
	</h1>
	<p class="mb-6 text-sm text-muted-foreground">{data.incident.diseaseName}</p>

	{#if data.incident.deletedAt}
		<div class="mb-6 rounded-md border bg-muted p-4">
			<p class="text-sm font-medium">This detection is retracted.</p>
			<p class="mt-1 text-sm text-muted-foreground">
				It does not appear on the public map. Its history is kept either way.
			</p>
			<form method="POST" action="?/restore" use:enhance class="mt-3">
				<Button type="submit" variant="secondary">Restore</Button>
			</form>
		</div>
	{/if}

	<IncidentForm
		diseases={data.diseases}
		counties={data.counties}
		suggestions={data.suggestions}
		values={form?.values ?? data.incident}
		errors={form?.errors ?? {}}
		submitLabel="Save changes"
		maxDate={data.maxDate}
		action="?/save"
	/>

	{#if !data.incident.deletedAt}
		<div class="mt-10 border-t pt-6">
			<h2 class="text-sm font-medium">Retract this detection</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				It will be removed from the public map. Nothing is deleted — retraction can be undone.
			</p>

			{#if confirmingRetract}
				<form method="POST" action="?/retract" use:enhance class="mt-3 flex items-center gap-3">
					<Button type="submit" variant="destructive">Yes, retract it</Button>
					<button
						type="button"
						class="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
						onclick={() => (confirmingRetract = false)}
					>
						Cancel
					</button>
				</form>
			{:else}
				<Button
					type="button"
					variant="outline"
					class="mt-3"
					onclick={() => (confirmingRetract = true)}
				>
					Retract
				</Button>
			{/if}
		</div>
	{/if}
</main>
