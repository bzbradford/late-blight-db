<script lang="ts">
	import { slide } from 'svelte/transition';
	import { resolve } from '$app/paths';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import { addDays, daysBetweenIso, MAX_LABELS } from '$lib/map/labels';
	import { formatShortDate } from '$lib/map/tooltip';
	import type { ViewState } from '$lib/state/view.svelte';
	import ShareButton from './ShareButton.svelte';

	type Props = {
		view: ViewState;
		/** How many counties qualify for a label at the current date — see `selectLabels`. */
		labelTotal: number;
		downloadHref: string;
		isAdmin: boolean;
	};

	let { view, labelTotal, downloadHref, isAdmin }: Props = $props();

	let open = $state(false);

	let labelsOn = $derived(view.labelsSince !== null);
	let jan1 = $derived(`${view.year}-01-01`);
	let rangeDays = $derived(Math.max(0, daysBetweenIso(jan1, view.labelEnd)));
	let sliderValue = $derived(view.labelsSince ? daysBetweenIso(jan1, view.labelsSince) : 0);
	let daysBack = $derived(view.labelsSince ? daysBetweenIso(view.labelsSince, view.labelEnd) : 0);

	let summary = $derived(
		view.labelsSince ? `Labels since ${formatShortDate(view.labelsSince)}` : null
	);
</script>

<div class="border-b bg-background">
	<div class="flex h-10 items-center gap-2 px-4">
		<button
			type="button"
			class="-ml-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			aria-expanded={open}
			aria-controls="map-tools"
			onclick={() => (open = !open)}
		>
			<ChevronDownIcon
				class="size-4 transition-transform {open ? 'rotate-180' : ''}"
				aria-hidden="true"
			/>
			Map tools
		</button>
		{#if !open && summary}
			<span class="truncate text-xs text-muted-foreground">{summary}</span>
		{/if}

		<div class="ml-auto flex items-center gap-2">
			<!-- A file download, so the router must stay out of it. `downloadHref` is already
			     resolved by the caller. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={downloadHref}
				download
				data-sveltekit-reload
				class="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
			>
				<DownloadIcon class="size-3.5" aria-hidden="true" /> Download CSV
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
			<ShareButton {view} />
		</div>
	</div>

	{#if open}
		<div
			id="map-tools"
			transition:slide={{ duration: 180 }}
			class="flex flex-wrap items-center gap-x-8 gap-y-3 border-t px-4 py-3"
		>
			<label class="flex cursor-pointer items-center gap-2 text-sm">
				<input
					type="checkbox"
					role="switch"
					class="peer sr-only"
					checked={labelsOn}
					onchange={(e) => view.setLabels(e.currentTarget.checked)}
				/>
				<span
					aria-hidden="true"
					class="relative h-5 w-9 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-background after:shadow after:transition-transform peer-checked:after:translate-x-4"
				></span>
				Label counties with detections
			</label>

			{#if view.labelsSince}
				<div class="flex min-w-64 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
					<label for="label-since" class="text-sm whitespace-nowrap">
						Since <span class="font-medium">{formatShortDate(view.labelsSince)}</span>
						<span class="text-muted-foreground">
							· {daysBack === 0 ? 'last day only' : `last ${daysBack} days`}
						</span>
					</label>
					<input
						id="label-since"
						type="range"
						min="0"
						max={rangeDays}
						step="1"
						value={sliderValue}
						aria-valuetext={formatShortDate(view.labelsSince)}
						oninput={(e) => (view.labelsSince = addDays(jan1, Number(e.currentTarget.value)))}
						class="min-w-40 flex-1 accent-primary"
					/>
					<span class="text-xs whitespace-nowrap text-muted-foreground" aria-live="polite">
						{#if labelTotal === 0}
							No detections in this window
						{:else if labelTotal > MAX_LABELS}
							Showing the {MAX_LABELS} most recent of {labelTotal} counties
						{:else}
							{labelTotal} {labelTotal === 1 ? 'county' : 'counties'} labelled · drag to adjust
						{/if}
					</span>
				</div>
			{/if}

			{#if isAdmin}
				<a
					href={resolve('/admin/import')}
					class="ml-auto text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
				>
					Import CSV
				</a>
			{/if}
		</div>
	{/if}
</div>
