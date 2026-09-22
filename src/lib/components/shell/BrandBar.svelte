<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { theme } from '$lib/state/theme.svelte';

	let { isAdmin = false }: { isAdmin?: boolean } = $props();
</script>

<!--
	The UW red is a brand colour, not a theme token: it is the same in light and dark mode,
	and white text on it holds ~5.9:1 contrast in both.
-->
<div
	class="flex h-(--brand-bar-h) shrink-0 items-center gap-4 bg-(--brand-uw) px-4 text-xs text-white"
>
	<a
		href="https://www.wisc.edu"
		class="mr-auto font-semibold tracking-wide hover:underline focus-visible:underline focus-visible:outline-none"
	>
		University of Wisconsin–Madison
	</a>

	{#if isAdmin}
		<a href={resolve('/admin')} class="text-white/90 hover:text-white hover:underline">
			Administration
		</a>
		<!-- POST-only: a GET-triggerable sign-out can be fired by any embedded image. -->
		<form method="POST" action="/logout" use:enhance>
			<button type="submit" class="text-white/90 hover:text-white hover:underline">
				Sign out
			</button>
		</form>
	{:else}
		<a href={resolve('/login')} class="text-white/90 hover:text-white hover:underline">Sign in</a>
	{/if}

	<button
		type="button"
		onclick={() => theme.toggle()}
		aria-label={theme.current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
		class="-mr-1 grid size-6 place-items-center rounded-full hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
	>
		<!-- Icon follows the `.dark` class so it is right on first paint, before hydration. -->
		<MoonIcon class="size-3.5 dark:hidden" aria-hidden="true" />
		<SunIcon class="hidden size-3.5 dark:block" aria-hidden="true" />
	</button>
</div>
