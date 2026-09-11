<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<div class="min-h-screen">
	<header class="border-b bg-background">
		<div class="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
			<a href={resolve('/admin')} class="text-base font-semibold tracking-tight">Administration</a>
			<a href={resolve('/')} class="text-sm text-muted-foreground hover:text-foreground">
				View public map
			</a>
			<div class="ml-auto flex items-center gap-3">
				<span class="text-sm text-muted-foreground">{data.user.email}</span>
				<form method="POST" action="/logout" use:enhance>
					<button
						type="submit"
						class="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
					>
						Sign out
					</button>
				</form>
			</div>
		</div>
	</header>

	{@render children()}
</div>
