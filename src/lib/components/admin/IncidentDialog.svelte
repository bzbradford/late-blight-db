<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import DeleteIncidentDialog from '$lib/components/admin/DeleteIncidentDialog.svelte';
	import IncidentForm from '$lib/components/admin/IncidentForm.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { IncidentEditor } from '$lib/state/incident-editor.svelte';
	import type { FieldErrors, IncidentInput } from '$lib/validation/incident';

	type Props = {
		editor: IncidentEditor;
		/** After a write lands: refresh whatever the page behind the modal is showing. */
		onChanged: () => void | Promise<void>;
	};

	let { editor, onChanged }: Props = $props();

	type Failure = {
		errors: FieldErrors;
		values: Partial<IncidentInput>;
		duplicates?: { id: number; publicId: string; crop: string | null; strain: string | null }[];
	};

	let failure = $state<Failure | null>(null);
	let problem = $state<string | null>(null);
	let confirmingRetract = $state(false);

	// Each opening starts clean.
	$effect(() => {
		if (editor.current) {
			failure = null;
			problem = null;
			confirmingRetract = false;
		}
	});

	/**
	 * The actions redirect on success, which is right for the full pages. Here the page
	 * behind the modal is a different one, so the redirect means only "done".
	 */
	async function handle(result: ActionResult) {
		if (result.type === 'redirect' || result.type === 'success') {
			await editor.discard();
			await onChanged();
		} else if (result.type === 'failure' && result.status !== 401) {
			failure = (result.data as Failure | undefined) ?? null;
			problem = null;
		} else if (result.type === 'failure' || (result.type === 'error' && result.status === 401)) {
			// Keep what was typed; a 401 carries no values to redisplay.
			problem = 'Your session has ended. Sign in again in another tab, then save.';
		} else {
			problem = 'The change could not be saved. Please try again.';
		}
	}

	function enhanceWith() {
		return async ({ result }: { result: ActionResult }) => handle(result);
	}
</script>

<Dialog.Root
	bind:open={
		() => editor.current !== null,
		(open) => {
			if (!open) editor.requestClose();
		}
	}
>
	{#if editor.current}
		{@const { href, data } = editor.current}
		{@const incident = data.incident}
		<Dialog.Content class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
			<Dialog.Header>
				<Dialog.Title class="text-lg">
					{incident ? `${incident.countyName}, ${incident.stateUsps}` : 'Add detection'}
				</Dialog.Title>
				<Dialog.Description>
					{#if incident}
						{incident.diseaseName} · <span class="font-mono">{incident.publicId}</span>
					{:else}
						Everything recorded here appears on the public map, except coordinates.
					{/if}
				</Dialog.Description>
			</Dialog.Header>

			{#if incident?.deletedAt}
				<div class="rounded-md border bg-muted p-4">
					<p class="text-sm font-medium">This detection is retracted.</p>
					<p class="mt-1 text-sm text-muted-foreground">
						It does not appear on the public map. Its history is kept either way.
					</p>
					<div class="mt-3 flex flex-wrap gap-3">
						<form method="POST" action="{href}?/restore" use:enhance={enhanceWith}>
							<Button type="submit" variant="secondary">Restore</Button>
						</form>
						{#if data.canDelete}
							<DeleteIncidentDialog
								action="{href}?/delete"
								publicId={incident.publicId}
								submit={enhanceWith}
							/>
						{/if}
					</div>
				</div>
			{/if}

			{#if problem}
				<p role="alert" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{problem}
				</p>
			{/if}

			<IncidentForm
				diseases={data.diseases}
				counties={data.counties}
				suggestions={data.suggestions}
				values={failure?.values ?? incident ?? { reportedOn: data.maxDate }}
				errors={failure?.errors ?? {}}
				duplicates={failure?.duplicates ?? []}
				submitLabel={incident ? 'Save changes' : 'Add detection'}
				maxDate={data.maxDate}
				action={incident ? `${href}?/save` : href}
				onResult={handle}
				onDirtyChange={(dirty) => (editor.dirty = dirty)}
				onCancel={() => editor.requestClose()}
			/>

			{#if incident && !incident.deletedAt}
				<div class="border-t pt-4">
					{#if confirmingRetract}
						<form
							method="POST"
							action="{href}?/retract"
							use:enhance={enhanceWith}
							class="flex flex-wrap items-center gap-3"
						>
							<p class="text-sm">Remove it from the public map? This can be undone.</p>
							<Button type="submit" variant="destructive">Yes, retract it</Button>
							<button
								type="button"
								class="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
								onclick={() => (confirmingRetract = false)}
							>
								Cancel
							</button>
						</form>
					{:else}
						<Button type="button" variant="destructive" onclick={() => (confirmingRetract = true)}>
							Retract
						</Button>
					{/if}
				</div>
			{/if}

			{#if editor.confirmingDiscard}
				<!-- Sticky, so it is seen even when the form has been scrolled. -->
				<div
					role="alert"
					class="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-3 border-t bg-popover px-4 py-3"
				>
					<p class="mr-auto text-sm font-medium">Discard unsaved changes?</p>
					<Button
						type="button"
						variant="secondary"
						onclick={() => editor.keepEditing()}
						{@attach (el: HTMLElement) => el.focus()}
					>
						Keep editing
					</Button>
					<Button type="button" variant="destructive" onclick={() => editor.discard()}>
						Discard
					</Button>
				</div>
			{/if}
		</Dialog.Content>
	{/if}
</Dialog.Root>
