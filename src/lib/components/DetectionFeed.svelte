<script lang="ts">
	import { tick } from 'svelte';
	import { requestFlyTo } from '$lib/state/selection.svelte';
	import type { Detection } from '$lib/server/queries/detections';

	type Props = {
		detections: Detection[];
		selectedCounty: string | null;
		diseaseName: string;
		year: number;
		onSelect: (fips: string | null) => void;
	};

	let { detections, selectedCounty, diseaseName, year, onSelect }: Props = $props();

	let listEl: HTMLDivElement | undefined = $state();

	/** Newest first, grouped so a county reported several times reads as one day's news. */
	let groups = $derived.by(() => {
		// Rebuilt from scratch on every derivation and never mutated afterwards, so the
		// reactive SvelteMap wrapper would only add overhead.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const byDate = new Map<string, Detection[]>();
		for (const d of detections) {
			const existing = byDate.get(d.observedOn);
			if (existing) existing.push(d);
			else byDate.set(d.observedOn, [d]);
		}
		return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
	});

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

	function formatDate(iso: string) {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(undefined, {
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}

	/**
	 * Bring the first detection for the selected county into view. Runs whenever the
	 * selection changes, including on a deep link, so `?county=` arrives already scrolled.
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
		<p class="text-sm font-medium">
			{detections.length}
			{detections.length === 1 ? 'detection' : 'detections'}
		</p>
		<p class="text-xs text-muted-foreground">{diseaseName}, {year}</p>

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
			{#each groups as [date, items] (date)}
				<section>
					<h2
						class="sticky top-0 bg-muted/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur"
					>
						{formatDate(date)}
					</h2>
					<ul>
						{#each items as detection (detection.id)}
							{@const active = detection.countyFips === selectedCounty}
							<li data-fips={detection.countyFips} class="border-b last:border-b-0">
								<button
									type="button"
									aria-pressed={active}
									class="w-full border-l-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 {active
										? 'border-l-foreground bg-muted'
										: 'border-l-transparent'}"
									onclick={() => {
										onSelect(active ? null : detection.countyFips);
										if (!active) requestFlyTo(detection.countyFips);
									}}
								>
									<p class="text-sm font-medium">
										{detection.countyName}, {detection.stateUsps}
									</p>

									{#if detection.crop || detection.operationType || detection.strain}
										<p class="mt-1 flex flex-wrap gap-1">
											{#each [detection.crop, detection.operationType, detection.strain].filter(Boolean) as tag (tag)}
												<span class="rounded bg-secondary px-1.5 py-0.5 text-xs">{tag}</span>
											{/each}
										</p>
									{/if}

									{#if detection.comments}
										<p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
											{detection.comments}
										</p>
									{/if}

									{#if detection.source}
										<p class="mt-1 text-xs text-muted-foreground italic">{detection.source}</p>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		{/if}
	</div>
</div>
