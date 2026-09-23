<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
</script>

<svelte:head
	><title>{page.status === 404 ? 'Page not found' : 'Something went wrong'}</title></svelte:head
>

<main class="mx-auto max-w-xl px-4 py-16">
	<p class="font-mono text-sm text-muted-foreground">{page.status}</p>
	<h1 class="mt-2 text-2xl font-semibold tracking-tight">
		{page.status === 404 ? 'Page not found' : 'Something went wrong'}
	</h1>
	<p class="mt-3 text-sm text-muted-foreground">
		{#if page.status === 404}
			There is nothing at this address. The detection map is on the home page.
		{:else}
			{page.error?.message ?? 'An unexpected error occurred.'} Please try again in a moment.
		{/if}
	</p>
	<!-- A full reload: whatever broke, the map starts again from a clean view. -->
	<a
		href={resolve('/')}
		data-sveltekit-reload
		class="mt-6 inline-block rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
	>
		Go to the detection map
	</a>
</main>
