<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function formatDate(iso: string) {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head><title>Detections</title></svelte:head>

<main class="mx-auto max-w-5xl px-4 py-8">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="mr-auto text-xl font-semibold tracking-tight">Detections</h1>
		<Button href={resolve('/admin/incidents/new')}>Add detection</Button>
	</div>

	<form method="GET" class="mt-6 flex flex-wrap items-end gap-3">
		<div class="space-y-1">
			<label for="diseaseId" class="text-xs text-muted-foreground">Disease</label>
			<select
				id="diseaseId"
				name="diseaseId"
				class="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
			>
				<option value="">All</option>
				{#each data.diseases as disease (disease.id)}
					<option value={disease.id} selected={data.filters.diseaseId === disease.id}>
						{disease.name}
					</option>
				{/each}
			</select>
		</div>

		<div class="space-y-1">
			<label for="year" class="text-xs text-muted-foreground">Year</label>
			<input
				id="year"
				name="year"
				type="number"
				min="1900"
				max="2999"
				value={data.filters.year ?? ''}
				class="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
			/>
		</div>

		<label class="flex items-center gap-2 text-sm">
			<input
				type="checkbox"
				name="includeDeleted"
				value="1"
				checked={data.filters.includeDeleted}
			/>
			Show retracted
		</label>

		<Button type="submit" variant="secondary">Apply</Button>
	</form>

	{#if data.incidents.length === 0}
		<p class="mt-8 text-sm text-muted-foreground">No detections match these filters.</p>
	{:else}
		<div class="mt-6 overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="border-b text-left text-xs text-muted-foreground">
					<tr>
						<th class="py-2 pr-3 font-medium">Observed</th>
						<th class="py-2 pr-3 font-medium">County</th>
						<th class="py-2 pr-3 font-medium">Disease</th>
						<th class="py-2 pr-3 font-medium">Crop</th>
						<th class="py-2 pr-3 font-medium">Strain</th>
						<th class="py-2 font-medium"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.incidents as incident (incident.id)}
						<tr
							class="border-b last:border-b-0 {incident.deletedAt ? 'text-muted-foreground' : ''}"
						>
							<td class="py-2 pr-3 whitespace-nowrap">{formatDate(incident.observedOn)}</td>
							<td class="py-2 pr-3">
								{incident.countyName}, {incident.stateUsps}
								{#if incident.deletedAt}
									<span class="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">Retracted</span>
								{/if}
							</td>
							<td class="py-2 pr-3">{incident.diseaseName}</td>
							<td class="py-2 pr-3">{incident.crop ?? '—'}</td>
							<td class="py-2 pr-3">{incident.strain ?? '—'}</td>
							<td class="py-2 text-right">
								<a
									href={resolve('/admin/incidents/[id]', { id: String(incident.id) })}
									class="underline underline-offset-4">Edit</a
								>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</main>
