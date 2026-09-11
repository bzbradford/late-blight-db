<script lang="ts">
	import { legendFor, type SymbologyMode } from '$lib/map/symbology';

	type Props = { mode: SymbologyMode; year: number };
	let { mode, year }: Props = $props();

	let entries = $derived(legendFor(mode));
	let caption = $derived(
		mode === 'recency'
			? 'Time since most recent detection'
			: `First detection during the ${year} season`
	);
</script>

<div class="rounded-lg border bg-background/90 p-3 backdrop-blur">
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
			<span>No detections reported</span>
		</li>
	</ul>
</div>
