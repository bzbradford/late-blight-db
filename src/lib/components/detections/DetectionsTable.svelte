<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ColumnDef, PaginationState } from '@tanstack/table-core';
	import DataTable from '$lib/components/data-table/DataTable.svelte';
	import { renderSnippet } from '$lib/components/ui/data-table';
	import { formatShortDate } from '$lib/map/tooltip';
	import type { DetectionRow } from '$lib/server/queries/detections';

	type Props = {
		detections: DetectionRow[];
		pagination: PaginationState;
		/** The search box's text; see `searchText` for what it looks through. */
		search?: string;
		/** Show everything recorded about a detection. */
		onDetails: (detection: DetectionRow) => void;
		/** Only offered when `detection.canEdit`. Receives the click so modified clicks still reach the page. */
		onEdit: (event: MouseEvent, href: string) => void;
	};

	let { detections, pagination = $bindable(), search = '', onDetails, onEdit }: Props = $props();

	/**
	 * Everything a visitor might search by, including what only Details shows (source,
	 * comments) and the date as displayed ("Sep 21") as well as stored ("2026-09-21").
	 */
	function searchText(d: DetectionRow) {
		return [
			d.publicId,
			d.observedOn,
			formatShortDate(d.observedOn),
			`${d.countyName}, ${d.stateUsps}`,
			d.diseaseName,
			d.crop,
			d.operationType,
			d.strain,
			d.source,
			d.comments,
			d.reportedBy?.name,
			d.reportedBy?.affiliation
		].join(' · ');
	}

	/** The public map, opened on this detection's disease, year, and county — a Share link. */
	function mapHref(d: DetectionRow) {
		const query = new URLSearchParams({
			disease: d.diseaseSlug,
			year: d.observedOn.slice(0, 4),
			county: d.countyFips
		});
		return `${resolve('/')}?${query}`;
	}

	// Nulls sort last whichever way the column runs; TanStack only does that for `undefined`.
	const orLast = (value: string | null) => value ?? undefined;

	// Cell snippets take the row, never a bare value: FlexRender spreads params into an object.
	const columns: ColumnDef<DetectionRow>[] = [
		{
			id: 'publicId',
			accessorKey: 'publicId',
			header: 'ID',
			cell: ({ row }) => renderSnippet(publicIdCell, row.original)
		},
		{
			id: 'observedOn',
			accessorKey: 'observedOn',
			header: 'Observed',
			sortDescFirst: true,
			cell: ({ row }) => renderSnippet(dateCell, row.original)
		},
		{
			id: 'county',
			accessorFn: (d) => `${d.countyName}, ${d.stateUsps}`,
			header: 'County',
			cell: ({ row }) => renderSnippet(countyCell, row.original)
		},
		{ id: 'disease', accessorKey: 'diseaseName', header: 'Disease' },
		{
			id: 'crop',
			accessorFn: (d) => orLast(d.crop),
			header: 'Crop',
			sortUndefined: 'last',
			cell: ({ getValue }) => getValue() ?? '—'
		},
		{
			id: 'operationType',
			accessorFn: (d) => orLast(d.operationType),
			header: 'Operation',
			sortUndefined: 'last',
			cell: ({ getValue }) => getValue() ?? '—'
		},
		{
			id: 'strain',
			accessorFn: (d) => orLast(d.strain),
			header: 'Strain',
			sortUndefined: 'last',
			cell: ({ getValue }) => getValue() ?? '—'
		},
		{
			id: 'reportedBy',
			accessorFn: (d) => d.reportedBy?.name,
			header: 'Reported by',
			sortUndefined: 'last',
			cell: ({ row }) => renderSnippet(reporterCell, row.original)
		},
		{
			id: 'actions',
			header: () => renderSnippet(actionsHeader),
			enableSorting: false,
			cell: ({ row }) => renderSnippet(actionsCell, row.original)
		}
	];
</script>

{#snippet publicIdCell(d: DetectionRow)}
	<span class="font-mono text-xs text-muted-foreground">{d.publicId}</span>
{/snippet}

{#snippet dateCell(d: DetectionRow)}
	<span class="whitespace-nowrap">{formatShortDate(d.observedOn)}</span>
{/snippet}

{#snippet countyCell(d: DetectionRow)}
	<!-- Opening a map link from a table is a request for the map, so these are plain links. -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the path is resolved -->
	<a href={mapHref(d)} class="underline-offset-4 hover:underline" title="Show on the map"
		>{d.countyName}, {d.stateUsps}</a
	>
	{#if d.retracted}
		<span class="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">Retracted</span>
	{/if}
{/snippet}

{#snippet reporterCell(d: DetectionRow)}
	{#if d.reportedBy}
		<span title={d.reportedBy.affiliation ?? undefined}>{d.reportedBy.name}</span>
		{#if d.imported}
			<span class="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">Imported</span>
		{/if}
	{:else}
		—
	{/if}
{/snippet}

{#snippet actionsHeader()}
	<span class="sr-only">Actions</span>
{/snippet}

{#snippet actionsCell(d: DetectionRow)}
	{@const editHref = resolve('/admin/incidents/[id]', { id: String(d.id) })}
	<div class="flex justify-end gap-3 whitespace-nowrap">
		<button
			type="button"
			onclick={() => onDetails(d)}
			class="underline underline-offset-4"
			aria-label="Details for {d.publicId}">Details</button
		>
		<!-- Reporters edit only their own; the page and its actions refuse the rest. -->
		{#if d.canEdit}
			<a
				href={editHref}
				onclick={(e) => onEdit(e, editHref)}
				class="underline underline-offset-4"
				aria-label="Edit {d.publicId}">Edit</a
			>
		{/if}
	</div>
{/snippet}

<DataTable
	data={detections}
	{columns}
	getRowId={(d) => String(d.id)}
	bind:pagination
	initialSorting={[{ id: 'observedOn', desc: true }]}
	rowClass={(d) => (d.retracted ? 'text-muted-foreground' : '')}
	noun={['detection', 'detections']}
	{search}
	{searchText}
	emptyMessage={search.trim()
		? `No detections match “${search.trim()}”.`
		: 'No detections match these filters.'}
/>
