<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import IncidentDialog from '$lib/components/admin/IncidentDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { IncidentEditor } from '$lib/state/incident-editor.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const editor = new IncidentEditor();

	/** A year typed into the URL by hand still shows as selected, even with no data. */
	let yearOptions = $derived(
		data.filters.year && !data.years.includes(data.filters.year)
			? [data.filters.year, ...data.years].sort((a, b) => b - a)
			: data.years
	);

	let filtered = $derived(
		data.filters.diseaseId !== undefined ||
			data.filters.year !== undefined ||
			data.filters.includeDeleted
	);

	/**
	 * Filters apply as soon as they change. Empty values are left out so the default view is
	 * a plain `/admin`, and the history entry is replaced so Back leaves the list rather
	 * than stepping through every filter change.
	 */
	function applyFilters(form: HTMLFormElement) {
		// A throwaway builder, not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams();
		for (const [key, value] of new FormData(form)) {
			if (typeof value === 'string' && value !== '') params.set(key, value);
		}
		const query = params.size ? `?${params}` : '';
		// The path is resolved; only the query string is appended.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${resolve('/admin')}${query}`, { replaceState: true, keepFocus: true, noScroll: true });
	}

	/** Plain clicks open the modal; modified clicks (new tab, etc.) still reach the page. */
	function openInModal(event: MouseEvent, href: string) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;
		event.preventDefault();
		editor.open(href);
	}

	function formatDate(iso: string) {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head><title>Detections · Administration</title></svelte:head>

<main class="mx-auto max-w-5xl px-4 py-8">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="mr-auto text-xl font-semibold tracking-tight">Detections</h1>
		<Button
			href={resolve('/admin/incidents/new')}
			onclick={(e: MouseEvent) => openInModal(e, resolve('/admin/incidents/new'))}
			disabled={editor.loading}
		>
			Add detection
		</Button>
	</div>

	<form
		method="GET"
		class="mt-6 flex flex-wrap items-end gap-3"
		onchange={(e) => applyFilters(e.currentTarget)}
	>
		<div class="space-y-1">
			<label for="filter-disease" class="text-xs text-muted-foreground">Disease</label>
			<select
				id="filter-disease"
				name="diseaseId"
				class="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
			>
				<option value="" selected={data.filters.diseaseId === undefined}>All diseases</option>
				{#each data.diseases as disease (disease.id)}
					<option value={disease.id} selected={data.filters.diseaseId === disease.id}>
						{disease.name}
					</option>
				{/each}
			</select>
		</div>

		<div class="space-y-1">
			<label for="filter-year" class="text-xs text-muted-foreground">Year</label>
			<select
				id="filter-year"
				name="year"
				class="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
			>
				<option value="" selected={data.filters.year === undefined}>All years</option>
				{#each yearOptions as year (year)}
					<option value={year} selected={data.filters.year === year}>{year}</option>
				{/each}
			</select>
		</div>

		<label class="flex items-center gap-2 py-1.5 text-sm">
			<input
				type="checkbox"
				name="includeDeleted"
				value="1"
				checked={data.filters.includeDeleted}
			/>
			Show retracted
		</label>

		<!-- Filters apply on change; this is only for browsers without JavaScript. -->
		<noscript><Button type="submit" variant="secondary">Apply</Button></noscript>

		{#if filtered}
			<a
				href={resolve('/admin')}
				data-sveltekit-replacestate
				data-sveltekit-noscroll
				class="py-1.5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
			>
				Reset filters
			</a>
		{/if}
	</form>

	{#if data.incidents.length === 0}
		<p class="mt-8 text-sm text-muted-foreground">No detections match these filters.</p>
	{:else}
		<div class="mt-6 overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="border-b text-left text-xs text-muted-foreground">
					<tr>
						<th class="py-2 pr-3 font-medium">ID</th>
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
						{@const href = resolve('/admin/incidents/[id]', { id: String(incident.id) })}
						<tr
							class="border-b last:border-b-0 {incident.deletedAt ? 'text-muted-foreground' : ''}"
						>
							<td class="py-2 pr-3 font-mono text-xs text-muted-foreground">{incident.publicId}</td>
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
								<a {href} onclick={(e) => openInModal(e, href)} class="underline underline-offset-4"
									>Edit</a
								>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</main>

<IncidentDialog {editor} onChanged={() => invalidateAll()} />
