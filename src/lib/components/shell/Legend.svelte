<script lang="ts">
	import {
		legendCaption,
		legendFor,
		NO_DETECTIONS_LABEL,
		type SymbologyMode
	} from '$lib/map/symbology';

	type Props = { mode: SymbologyMode; year: number };
	let { mode, year }: Props = $props();

	let entries = $derived(legendFor(mode));
	let caption = $derived(legendCaption(mode, year));

	/** Phones only: the full legend would cover a third of the map, so it starts folded. */
	let expanded = $state(false);
</script>

<div class="rounded-lg border bg-background/90 backdrop-blur md:p-3">
	<!-- Folded on phones: a row of swatches that opens the full legend. -->
	<button
		type="button"
		class="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium md:hidden"
		aria-expanded={expanded}
		aria-controls="map-legend"
		onclick={() => (expanded = !expanded)}
	>
		Legend
		<span class="flex gap-0.5" aria-hidden="true">
			{#each entries as entry (entry.token)}
				<span
					class="inline-block size-2.5 rounded-sm border border-border"
					style="background: var({entry.token})"
				></span>
			{/each}
		</span>
	</button>

	<div id="map-legend" class="{expanded ? 'block' : 'hidden'} px-3 pb-3 md:block md:p-0">
		<p class="mb-2 text-xs font-medium text-muted-foreground">{caption}</p>
		<ul class="flex flex-col gap-1">
			{#each entries as entry (entry.token)}
				<li class="flex items-center gap-2 text-xs">
					<span
						class="inline-block size-3 shrink-0 rounded-sm border border-border"
						style="background: var({entry.token})"
						aria-hidden="true"
					></span>
					<span>{entry.label}</span>
				</li>
			{/each}
			<li class="mt-1 flex items-center gap-2 border-t pt-1.5 text-xs text-muted-foreground">
				<span
					class="inline-block size-3 shrink-0 rounded-sm border border-border"
					style="background: var(--county-none)"
					aria-hidden="true"
				></span>
				<span>{NO_DETECTIONS_LABEL}</span>
			</li>
		</ul>
	</div>
</div>
