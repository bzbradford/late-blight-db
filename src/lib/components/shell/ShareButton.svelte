<script lang="ts">
	import { page } from '$app/state';
	import CheckIcon from '@lucide/svelte/icons/check';
	import LinkIcon from '@lucide/svelte/icons/link';
	import { Button } from '$lib/components/ui/button';
	import type { ViewState } from '$lib/state/view.svelte';

	let { view }: { view: ViewState } = $props();

	/**
	 * `manual` is the fallback when the Clipboard API is unavailable or refused — it
	 * requires a secure context, which a plain-HTTP intranet deploy would not be.
	 */
	let status = $state<'idle' | 'copied' | 'manual'>('idle');
	let link = $state('');
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	async function share() {
		link = view.shareUrl(page.url.origin);
		clearTimeout(resetTimer);
		try {
			await navigator.clipboard.writeText(link);
			status = 'copied';
			resetTimer = setTimeout(() => (status = 'idle'), 2500);
		} catch {
			status = 'manual';
		}
	}

	function selectAll(node: HTMLInputElement) {
		node.focus();
		node.select();
	}
</script>

<div class="relative">
	<Button variant="outline" size="sm" onclick={share}>
		{#if status === 'copied'}
			<CheckIcon aria-hidden="true" /> Link copied
		{:else}
			<LinkIcon aria-hidden="true" /> Share
		{/if}
	</Button>

	<!-- Announce the copy; the button label change alone is not reliably read out. -->
	<span class="sr-only" aria-live="polite">
		{status === 'copied' ? 'Link to this view copied to the clipboard' : ''}
	</span>

	{#if status === 'manual'}
		<div
			class="absolute top-full right-0 z-20 mt-2 w-80 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md"
		>
			<label for="share-link" class="mb-1.5 block text-xs text-muted-foreground">
				Copy this link to share the current view
			</label>
			<div class="flex gap-2">
				<input
					id="share-link"
					readonly
					value={link}
					use:selectAll
					class="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-xs"
				/>
				<Button variant="ghost" size="sm" onclick={() => (status = 'idle')}>Close</Button>
			</div>
		</div>
	{/if}
</div>
