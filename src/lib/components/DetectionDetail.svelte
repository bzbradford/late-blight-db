<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { timeAgo } from '$lib/feed/time-ago';
	import { formatShortDate } from '$lib/map/tooltip';
	import type { Detection } from '$lib/server/queries/detections';

	type Props = {
		/** The detection shown, or null when closed. */
		detection: Detection | null;
		diseaseName: string;
		isAdmin: boolean;
		onClose: () => void;
		/** Admins only: hand the detection to the editor. */
		onEdit: (detection: Detection) => void;
		/** The editor is loading. */
		editing?: boolean;
	};

	let { detection, diseaseName, isAdmin, onClose, onEdit, editing = false }: Props = $props();

	/** Only fields that hold something are listed — an empty row reads as missing data. */
	let rows = $derived(
		detection
			? (
					[
						[
							'Observed',
							`${formatShortDate(detection.observedOn)} (${timeAgo(detection.observedOn)})`
						],
						['Reported', detection.reportedOn ? formatShortDate(detection.reportedOn) : null],
						['Crop', detection.crop],
						['Operation', detection.operationType],
						['Strain', detection.strain],
						['Source', detection.source]
					] satisfies [string, string | null][]
				).filter((row): row is [string, string] => row[1] !== null)
			: []
	);
</script>

<Dialog.Root
	bind:open={
		() => detection !== null,
		(open) => {
			if (!open) onClose();
		}
	}
>
	{#if detection}
		<Dialog.Content class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title class="text-lg">{detection.countyName}, {detection.stateUsps}</Dialog.Title>
				<Dialog.Description>{diseaseName}</Dialog.Description>
			</Dialog.Header>

			<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
				{#each rows as [label, value] (label)}
					<dt class="text-muted-foreground">{label}</dt>
					<dd>{value}</dd>
				{/each}
				<dt class="text-muted-foreground">ID</dt>
				<!-- The `id` column in the CSV download. -->
				<dd class="font-mono">{detection.publicId}</dd>
			</dl>

			{#if detection.comments}
				<div>
					<p class="text-muted-foreground">Comments</p>
					<p class="mt-1 leading-relaxed whitespace-pre-line">{detection.comments}</p>
				</div>
			{/if}

			{#if isAdmin}
				<Dialog.Footer>
					<Button type="button" disabled={editing} onclick={() => onEdit(detection)}>
						<PencilIcon />
						{editing ? 'Opening…' : 'Edit'}
					</Button>
				</Dialog.Footer>
			{/if}
		</Dialog.Content>
	{/if}
</Dialog.Root>
