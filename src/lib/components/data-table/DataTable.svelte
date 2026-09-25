<script lang="ts" generics="TData">
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import {
		getCoreRowModel,
		getPaginationRowModel,
		getSortedRowModel,
		type ColumnDef,
		type PaginationState,
		type SortingState
	} from '@tanstack/table-core';
	import { Button } from '$lib/components/ui/button';
	import { createSvelteTable, FlexRender } from '$lib/components/ui/data-table';
	import * as Table from '$lib/components/ui/table';

	type Props = {
		data: TData[];
		columns: ColumnDef<TData>[];
		/** A stable key per row, so a re-sort or refresh moves rows rather than rebuilding them. */
		getRowId: (row: TData) => string;
		/** Bindable, so the owner can send the table back to page 1 when its filters change. */
		pagination?: PaginationState;
		initialSorting?: SortingState;
		/** Extra classes for a row, e.g. to dim a retracted one. */
		rowClass?: (row: TData) => string;
		/** What one row is called in the footer ("12 detections"). */
		noun?: [singular: string, plural: string];
		pageSizes?: number[];
		/** Shown when `data` is empty. */
		emptyMessage?: string;
	};

	let {
		data,
		columns,
		getRowId,
		pagination = $bindable({ pageIndex: 0, pageSize: 25 }),
		initialSorting = [],
		rowClass,
		noun = ['row', 'rows'],
		pageSizes = [25, 50, 100],
		emptyMessage = 'No results.'
	}: Props = $props();

	// The initial sort is a starting point; after that the viewer's clicks own it.
	// svelte-ignore state_referenced_locally
	let sorting = $state<SortingState>(initialSorting);

	/**
	 * A page past the end — after a retraction shortens the list, say — shows the last
	 * page instead of an empty table.
	 */
	let pageState = $derived({
		pageSize: pagination.pageSize,
		pageIndex: Math.min(
			pagination.pageIndex,
			Math.max(0, Math.ceil(data.length / pagination.pageSize) - 1)
		)
	});

	const table = createSvelteTable({
		get data() {
			return data;
		},
		get columns() {
			return columns;
		},
		getRowId: (row) => getRowId(row),
		state: {
			get sorting() {
				return sorting;
			},
			get pagination() {
				return pageState;
			}
		},
		onSortingChange: (updater) => {
			sorting = typeof updater === 'function' ? updater(sorting) : updater;
			// A new order starts from the top.
			pagination = { ...pagination, pageIndex: 0 };
		},
		onPaginationChange: (updater) => {
			pagination = typeof updater === 'function' ? updater(pageState) : updater;
		},
		// The owner resets the page when its filters change. Left on, TanStack would also
		// jump to page 1 whenever a row is edited and the data reloads.
		autoResetPageIndex: false,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel()
	});

	let first = $derived(pageState.pageIndex * pageState.pageSize + 1);
	let last = $derived(Math.min(data.length, first + pageState.pageSize - 1));
	let summary = $derived(
		data.length <= pageState.pageSize
			? `${data.length} ${data.length === 1 ? noun[0] : noun[1]}`
			: `${first}–${last} of ${data.length} ${noun[1]}`
	);

	function ariaSort(direction: false | 'asc' | 'desc') {
		if (direction === 'asc') return 'ascending';
		if (direction === 'desc') return 'descending';
		return undefined;
	}
</script>

<Table.Root>
	<Table.Header>
		{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
			<Table.Row>
				{#each headerGroup.headers as header (header.id)}
					{@const sorted = header.column.getIsSorted()}
					<Table.Head
						colspan={header.colSpan}
						aria-sort={ariaSort(sorted)}
						class="text-xs text-muted-foreground"
					>
						{#if header.isPlaceholder}
							<!-- Nothing: a spanning group header covers this cell. -->
						{:else if header.column.getCanSort()}
							<button
								type="button"
								onclick={header.column.getToggleSortingHandler()}
								class="-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {sorted
									? 'text-foreground'
									: ''}"
							>
								<FlexRender
									content={header.column.columnDef.header}
									context={header.getContext()}
								/>
								{#if sorted === 'asc'}
									<ArrowUpIcon class="size-3.5" aria-hidden="true" />
								{:else if sorted === 'desc'}
									<ArrowDownIcon class="size-3.5" aria-hidden="true" />
								{:else}
									<ChevronsUpDownIcon class="size-3.5 opacity-50" aria-hidden="true" />
								{/if}
							</button>
						{:else}
							<FlexRender content={header.column.columnDef.header} context={header.getContext()} />
						{/if}
					</Table.Head>
				{/each}
			</Table.Row>
		{/each}
	</Table.Header>
	<Table.Body>
		{#each table.getRowModel().rows as row (row.id)}
			<Table.Row class={rowClass?.(row.original)}>
				{#each row.getVisibleCells() as cell (cell.id)}
					<Table.Cell>
						<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
					</Table.Cell>
				{/each}
			</Table.Row>
		{:else}
			<Table.Row>
				<Table.Cell colspan={columns.length} class="h-24 text-center text-muted-foreground">
					{emptyMessage}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>

<div class="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3 text-sm">
	<p class="mr-auto text-muted-foreground" aria-live="polite">{summary}</p>

	{#if data.length > pageSizes[0]}
		<label class="flex items-center gap-2 text-muted-foreground">
			Rows per page
			<select
				value={pageState.pageSize}
				onchange={(e) => table.setPageSize(Number(e.currentTarget.value))}
				class="rounded-md border border-input bg-background px-2 py-1 text-foreground"
			>
				{#each pageSizes as size (size)}
					<option value={size}>{size}</option>
				{/each}
			</select>
		</label>
	{/if}

	{#if table.getPageCount() > 1}
		<div class="flex items-center gap-2">
			<span class="text-muted-foreground">
				Page {pageState.pageIndex + 1} of {table.getPageCount()}
			</span>
			<Button
				variant="outline"
				size="sm"
				onclick={() => table.previousPage()}
				disabled={!table.getCanPreviousPage()}
			>
				Previous
			</Button>
			<Button
				variant="outline"
				size="sm"
				onclick={() => table.nextPage()}
				disabled={!table.getCanNextPage()}
			>
				Next
			</Button>
		</div>
	{/if}
</div>
