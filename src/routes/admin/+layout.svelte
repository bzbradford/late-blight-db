<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { ROLE_LABELS } from '$lib/auth/roles';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<div class="min-h-[calc(100dvh-var(--brand-bar-h))]">
	<header class="border-b bg-background">
		<div class="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
			<a
				href={resolve('/')}
				class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeftIcon class="size-4" aria-hidden="true" />
				Back to map
			</a>
			<a href={resolve('/admin')} class="text-base font-semibold tracking-tight">Administration</a>
			{#if data.user.role === 'admin'}
				<a
					href={resolve('/admin/users')}
					class="text-sm text-muted-foreground hover:text-foreground"
				>
					Users
				</a>
				<a
					href={resolve('/admin/import')}
					class="text-sm text-muted-foreground hover:text-foreground"
				>
					Import CSV
				</a>
			{/if}
			<div class="ml-auto flex items-center gap-3">
				<!-- Sign-out lives in the branding bar above, on every page. -->
				<span class="text-sm text-muted-foreground">
					Signed in as
					<a
						href={resolve('/admin/account')}
						class="text-foreground underline-offset-4 hover:underline"
						title="Your account">{data.user.name}</a
					>
					({ROLE_LABELS[data.user.role]})
				</span>
			</div>
		</div>
	</header>

	{@render children()}
</div>
