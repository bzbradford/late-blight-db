<script lang="ts">
	import { resolve } from '$app/paths';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<div class="min-h-[calc(100dvh-var(--brand-bar-h))]">
	<header class="border-b bg-background">
		<div class="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
			<a href={resolve('/admin')} class="text-base font-semibold tracking-tight">Administration</a>
			<a
				href={resolve('/admin/incidents')}
				class="text-sm text-muted-foreground hover:text-foreground"
			>
				Detections
			</a>
			<a href={resolve('/')} class="text-sm text-muted-foreground hover:text-foreground">
				View public map
			</a>
			<div class="ml-auto flex items-center gap-3">
				<!-- Sign-out lives in the branding bar above, on every page. -->
				<span class="text-sm text-muted-foreground">{data.user.email}</span>
			</div>
		</div>
	</header>

	{@render children()}
</div>
