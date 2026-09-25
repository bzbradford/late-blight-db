<script lang="ts">
	import AppHeader from '$lib/components/shell/AppHeader.svelte';
	import * as Select from '$lib/components/ui/select';
	import type { Disease } from '$lib/server/queries/diseases';
	import type { ViewState } from '$lib/state/view.svelte';

	type Props = {
		diseases: Disease[];
		view: ViewState;
	};

	let { diseases, view }: Props = $props();
</script>

<AppHeader>
	{#snippet controls()}
		<nav aria-label="Disease" class="order-3 w-full sm:order-none sm:w-auto">
			<!-- Tabs size to their names, so two fit one row at 360 px; a third would wrap. -->
			<ul class="flex w-full flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-auto">
				{#each diseases as disease (disease.slug)}
					{@const active = disease.slug === view.disease}
					<li class="flex-auto sm:flex-none">
						<button
							type="button"
							aria-pressed={active}
							onclick={() => !active && view.show(disease.slug, view.year)}
							class="block w-full rounded-md px-2.5 py-1.5 text-center text-sm font-medium whitespace-nowrap ring-offset-background transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none sm:px-3 {active
								? 'bg-background text-foreground shadow-sm'
								: 'text-foreground/65 hover:text-foreground'}"
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
			<span id="year-label" class="sr-only text-sm text-muted-foreground sm:not-sr-only">Year</span>
			<Select.Root
				type="single"
				value={String(view.year)}
				onValueChange={(value) => value && view.show(view.disease, Number(value))}
			>
				<Select.Trigger aria-labelledby="year-label" class="w-20 sm:w-24"
					>{view.year}</Select.Trigger
				>
				<Select.Content>
					{#each view.years as year (year)}
						<Select.Item value={String(year)} label={String(year)}>{year}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	{/snippet}
</AppHeader>
