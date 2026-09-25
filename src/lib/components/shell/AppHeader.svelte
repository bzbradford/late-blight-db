<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	type Props = {
		/** Page-specific controls at the end of the bar — the map's disease and year pickers. */
		controls?: Snippet;
	};

	let { controls }: Props = $props();

	type Tab = {
		path: '/' | '/detections' | '/admin/account' | '/admin/users' | '/admin/import';
		label: string;
		current: (path: string) => boolean;
	};

	const under = (prefix: string) => (path: string) =>
		path === prefix || path.startsWith(`${prefix}/`);

	/**
	 * The site's sections. Account tabs are shown only to those the server would let in;
	 * `guardAdmin` is what actually keeps everyone else out.
	 */
	let tabs = $derived.by(() => {
		const list: Tab[] = [
			{ path: '/', label: 'Map', current: (p) => p === '/' },
			{
				path: '/detections',
				label: 'Detections',
				// A detection's own edit page is part of the list, not a section of its own.
				current: (p) => p === '/detections' || under('/admin/incidents')(p)
			}
		];
		if (page.data.signedIn) {
			list.push({
				path: '/admin/account',
				label: 'Account',
				current: under('/admin/account')
			});
		}
		if (page.data.isAdmin) {
			list.push(
				{ path: '/admin/users', label: 'Users', current: under('/admin/users') },
				{ path: '/admin/import', label: 'Import CSV', current: under('/admin/import') }
			);
		}
		return list;
	});
</script>

<header class="border-b bg-background">
	<div class="flex flex-wrap items-center gap-x-6 gap-y-2.5 px-4 py-2.5 sm:py-3">
		<!--
			A full reload, so the title always returns to the default view, like a fresh visit.
			On a phone the map's controls need its room: the header stays two rows, and the
			branding bar and page title still name the site.
		-->
		<a
			href={resolve('/')}
			data-sveltekit-reload
			class="text-base font-semibold tracking-tight {controls ? 'hidden sm:block' : ''}"
		>
			Vegetable Disease Detections
		</a>

		<nav aria-label="Site" class="mr-auto">
			<ul class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
				{#each tabs as tab, i (tab.path)}
					{@const current = tab.current(page.url.pathname)}
					<!-- A rule between the public sections and the signed-in ones. -->
					<li class={i === 2 ? 'border-l pl-4' : ''}>
						<a
							href={resolve(tab.path)}
							aria-current={current ? 'page' : undefined}
							class="underline-offset-[6px] {current
								? 'font-medium text-foreground underline decoration-2'
								: 'text-muted-foreground hover:text-foreground'}">{tab.label}</a
						>
					</li>
				{/each}
			</ul>
		</nav>

		{#if controls}
			<!--
				One unit from `sm` up, so it wraps to its own row whole. Below that its children
				join the header's own row, where they can order themselves around the nav.
			-->
			<div class="contents sm:flex sm:items-center sm:gap-6">
				{@render controls()}
			</div>
		{/if}
	</div>
</header>
