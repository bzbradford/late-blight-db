<script lang="ts">
	import { tick } from 'svelte';
	import Maximize2Icon from '@lucide/svelte/icons/maximize-2';
	import { feedSections } from '$lib/feed/sections';
	import { timeAgo } from '$lib/feed/time-ago';
	import type { SymbologyMode } from '$lib/map/symbology';
	import { formatMonthDay } from '$lib/map/tooltip';
	import { requestFlyTo } from '$lib/state/selection.svelte';
	import type { Detection } from '$lib/server/queries/detections';

	type Props = {
		detections: Detection[];
		selectedCounty: string | null;
		diseaseName: string;
		year: number;
		mode: SymbologyMode;
		onSelect: (fips: string | null) => void;
		onExpand: (detection: Detection) => void;
	};

	let { detections, selectedCounty, diseaseName, year, mode, onSelect, onExpand }: Props = $props();

	let listEl: HTMLDivElement | undefined = $state();

	/** Sections match the legend beside the map, so a card sits under its county's colour. */
	let sections = $derived(feedSections(detections, mode));

	let selectedCount = $derived(
		selectedCounty ? detections.filter((d) => d.countyFips === selectedCounty).length : 0
	);

	let selectedName = $derived(
		selectedCounty
			? (() => {
					const match = detections.find((d) => d.countyFips === selectedCounty);
					return match ? `${match.countyName}, ${match.stateUsps}` : null;
				})()
			: null
	);

	/**
	 * Bring the first detection for the selected county into view. Runs whenever the
	 * selection changes, including on arrival from a share link, which then opens already scrolled.
	 */
	$effect(() => {
		const fips = selectedCounty;
		if (!fips || !listEl) return;
		tick().then(() => {
			const target = listEl?.querySelector(`[data-fips="${fips}"]`);
			target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		});
	});
</script>

<div class="flex h-full min-h-0 flex-col">
	<div class="border-b bg-background px-4 py-3">
		<div class="flex items-start justify-between gap-2">
			<div>
				<p class="text-sm font-medium">
					{detections.length}
					{detections.length === 1 ? 'detection' : 'detections'}
				</p>
				<p class="text-xs text-muted-foreground">{diseaseName}, {year}</p>
			</div>
		</div>

		{#if selectedCounty}
			<div class="mt-2 flex items-center gap-2">
				<span class="rounded-full bg-muted px-2 py-0.5 text-xs">
					{#if selectedName}
						{selectedName} — {selectedCount}
						{selectedCount === 1 ? 'detection' : 'detections'}
					{:else}
						No detections in the selected county
					{/if}
				</span>
				<button
					type="button"
					class="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
					onclick={() => onSelect(null)}
				>
					Clear
				</button>
			</div>
		{/if}
	</div>

	<div bind:this={listEl} class="min-h-0 flex-1 overflow-y-auto">
		{#if detections.length === 0}
			<p class="p-4 text-sm text-muted-foreground">
				No {diseaseName.toLowerCase()} detections were reported in {year}. That is not the same as
				an absence of disease — it may simply mean nothing was reported.
			</p>
		{:else}
			{#each sections as section (section.token)}
				<section aria-labelledby="feed-{section.token}">
					<h2
						id="feed-{section.token}"
						class="sticky top-0 z-10 flex items-center gap-2 bg-muted/80 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur"
					>
						<span
							class="inline-block size-2.5 shrink-0 rounded-sm border border-border"
							style="background: var({section.token})"
							aria-hidden="true"
						></span>
						<span class="mr-auto">{section.label}</span>
						{#if section.items.length}
							<span class="tabular-nums">{section.items.length}</span>
						{/if}
					</h2>
					{#if section.items.length === 0}
						<p class="border-b px-4 py-2.5 text-xs text-muted-foreground">No detections</p>
					{:else}
						<ul>
							{#each section.items as detection (detection.id)}
								{@const active = detection.countyFips === selectedCounty}
								{@const place = `${detection.countyName}, ${detection.stateUsps}`}
								<li data-fips={detection.countyFips} class="relative border-b">
									<button
										type="button"
										aria-pressed={active}
										class="w-full border-l-3 py-3 pr-12 pl-4 text-left transition-colors hover:bg-muted/50 {active
											? 'border-l-foreground bg-muted'
											: 'border-l-transparent'}"
										onclick={() => {
											onSelect(active ? null : detection.countyFips);
											if (!active) requestFlyTo(detection.countyFips);
										}}
									>
										<p class="flex flex-wrap items-baseline gap-x-2">
											<span class="text-sm font-medium">{place}</span>
											<time datetime={detection.observedOn} class="text-xs text-muted-foreground">
												{formatMonthDay(detection.observedOn)}
												({timeAgo(detection.observedOn)})
											</time>
										</p>

										{#if detection.crop || detection.operationType || detection.strain}
											<p class="mt-1 flex flex-wrap gap-1">
												{#each [detection.crop, detection.operationType, detection.strain].filter(Boolean) as tag (tag)}
													<span class="rounded bg-secondary px-1.5 py-0.5 text-xs">{tag}</span>
												{/each}
											</p>
										{/if}

										{#if detection.comments}
											<!-- The full text is in the detail view. -->
											<p class="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
												{detection.comments}
											</p>
										{/if}

										{#if detection.source}
											<p class="mt-1 text-xs text-muted-foreground italic">{detection.source}</p>
										{/if}
									</button>
									<!-- A sibling, not a child: a button cannot contain another button. -->
									<button
										type="button"
										class="absolute top-2 right-2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
										aria-label="Details: {place}, {formatMonthDay(detection.observedOn)}"
										title="Show details"
										onclick={() => onExpand(detection)}
									>
										<Maximize2Icon class="size-3.5" />
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}
		{/if}
	</div>
</div>
