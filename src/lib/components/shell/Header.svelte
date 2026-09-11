<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import * as Select from '$lib/components/ui/select';
	import type { Disease } from '$lib/server/queries/diseases';

	type Props = {
		diseases: Disease[];
		years: number[];
		activeDisease: string;
		activeYear: number;
	};

	let { diseases, years, activeDisease, activeYear }: Props = $props();

	/**
	 * Disease and year live in the URL so every view is linkable — extension agents
	 * email these. The disease control is built from real links so it works without
	 * JavaScript and gets proper browser history for free.
	 *
	 * These navigations only change query parameters on the current route, so the href
	 * already goes through `resolve('/')` here rather than at each call site — which is
	 * what the lint suppressions below refer to.
	 */
	function hrefWith(params: Record<string, string>) {
		// Not reactive state — a throwaway builder discarded at the end of this call,
		// so the reactive SvelteURLSearchParams wrapper would buy nothing.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const next = new URLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(params)) next.set(k, v);
		// A county selected under one disease-year usually has nothing in another.
		next.delete('county');
		return `${resolve('/')}?${next.toString()}`;
	}
</script>

<header class="border-b bg-background">
	<div class="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
		<a href={resolve('/')} class="mr-auto text-base font-semibold tracking-tight">
			Vegetable Disease Detections
		</a>

		<nav aria-label="Disease" class="order-3 w-full sm:order-none sm:w-auto">
			<ul class="flex w-full gap-1 rounded-lg bg-muted p-1 sm:w-auto">
				{#each diseases as disease (disease.slug)}
					{@const active = disease.slug === activeDisease}
					<li class="flex-1 sm:flex-none">
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={hrefWith({ disease: disease.slug })}
							aria-current={active ? 'page' : undefined}
							class="block rounded-md px-3 py-1.5 text-center text-sm font-medium ring-offset-background transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none {active
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'}"
						>
							<span
								class="mr-1.5 inline-block size-2 rounded-full align-middle"
								style="background: var(--disease-{disease.slug})"
								aria-hidden="true"
							></span>{disease.name}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</li>
				{/each}
			</ul>
		</nav>

		<div class="flex items-center gap-2">
			<span id="year-label" class="text-sm text-muted-foreground">Year</span>
			<Select.Root
				type="single"
				value={String(activeYear)}
				onValueChange={(value) =>
					// eslint-disable-next-line svelte/no-navigation-without-resolve
					value && goto(hrefWith({ year: value }))}
			>
				<Select.Trigger aria-labelledby="year-label" class="w-24">{activeYear}</Select.Trigger>
				<Select.Content>
					{#each years as year (year)}
						<Select.Item value={String(year)} label={String(year)}>{year}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>
</header>
