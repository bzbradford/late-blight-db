<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Select from '$lib/components/ui/select';
	import type { Disease } from '$lib/server/queries/diseases';
	import type { ViewState } from '$lib/state/view.svelte';
	import ShareButton from './ShareButton.svelte';

	type Props = {
		diseases: Disease[];
		view: ViewState;
	};

	let { diseases, view }: Props = $props();
</script>

<header class="border-b bg-background">
	<div class="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
		<!-- A full reload, so the title always returns to the default view, like a fresh visit. -->
		<a
			href={resolve('/')}
			data-sveltekit-reload
			class="mr-auto text-base font-semibold tracking-tight"
		>
			Vegetable Disease Detections
		</a>

		<nav aria-label="Disease" class="order-3 w-full sm:order-none sm:w-auto">
			<ul class="flex w-full gap-1 rounded-lg bg-muted p-1 sm:w-auto">
				{#each diseases as disease (disease.slug)}
					{@const active = disease.slug === view.disease}
					<li class="flex-1 sm:flex-none">
						<button
							type="button"
							aria-pressed={active}
							onclick={() => !active && view.show(disease.slug, view.year)}
							class="block w-full rounded-md px-3 py-1.5 text-center text-sm font-medium ring-offset-background transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none {active
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'}"
						>
							<span
								class="mr-1.5 inline-block size-2 rounded-full align-middle"
								style="background: var(--disease-{disease.slug})"
								aria-hidden="true"
							></span>{disease.name}
						</button>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="flex items-center gap-2">
			<span id="year-label" class="text-sm text-muted-foreground">Year</span>
			<Select.Root
				type="single"
				value={String(view.year)}
				onValueChange={(value) => value && view.show(view.disease, Number(value))}
			>
				<Select.Trigger aria-labelledby="year-label" class="w-24">{view.year}</Select.Trigger>
				<Select.Content>
					{#each view.years as year (year)}
						<Select.Item value={String(year)} label={String(year)}>{year}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<ShareButton {view} />
	</div>
</header>
