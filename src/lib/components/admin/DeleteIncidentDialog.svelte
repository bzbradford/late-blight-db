<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';

	type Props = {
		/** The form action that deletes, e.g. `?/delete`. */
		action: string;
		/** The detection's public ID, so the admin can see exactly which one goes. */
		publicId: string;
		/** Handles the result; omit for the default (follow the redirect). */
		submit?: SubmitFunction;
	};

	let { action, publicId, submit }: Props = $props();

	let open = $state(false);
</script>

<Button type="button" variant="destructive" onclick={() => (open = true)}>Delete</Button>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete this detection permanently?</Dialog.Title>
			<Dialog.Description>
				Detection <span class="font-mono">{publicId}</span> will be removed from the database. This cannot
				be undone. Use it only for a detection entered in error — to take one off the map, retracting
				is enough.
			</Dialog.Description>
		</Dialog.Header>
		<form method="POST" {action} use:enhance={submit} class="flex flex-wrap justify-end gap-3">
			<Button
				type="button"
				variant="secondary"
				onclick={() => (open = false)}
				{@attach (el: HTMLElement) => el.focus()}
			>
				Cancel
			</Button>
			<Button type="submit" variant="destructive">Delete permanently</Button>
		</form>
	</Dialog.Content>
</Dialog.Root>
