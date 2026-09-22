<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import type { CountyOption } from '$lib/server/queries/admin';
	import type { Disease } from '$lib/server/queries/diseases';
	import type { FieldErrors, IncidentInput } from '$lib/validation/incident';

	type Props = {
		diseases: Disease[];
		counties: CountyOption[];
		suggestions: { crop: string[]; operationType: string[]; strain: string[]; source: string[] };
		values: Partial<IncidentInput>;
		errors?: FieldErrors;
		submitLabel: string;
		maxDate: string;
		/** Form action to post to. Omit for a page whose action is the default one. */
		action?: string;
		/**
		 * Active detections with the same disease, county, and date. When present, saving
		 * needs an explicit "add anyway" — see `/admin/incidents/new`.
		 */
		duplicates?: { id: number; publicId: string; crop: string | null; strain: string | null }[];
	};

	let {
		diseases,
		counties,
		suggestions,
		values,
		errors = {},
		submitLabel,
		maxDate,
		action,
		duplicates = []
	}: Props = $props();

	let submitting = $state(false);

	/** Counties grouped by state so the native select is navigable by type-ahead. */
	let byState = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const groups = new Map<string, CountyOption[]>();
		for (const c of counties) {
			const existing = groups.get(c.stateName);
			if (existing) existing.push(c);
			else groups.set(c.stateName, [c]);
		}
		return [...groups.entries()];
	});

	const inputClass =
		'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
</script>

<form
	method="POST"
	{action}
	class="space-y-5"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}}
>
	<div class="space-y-1.5">
		<label for="diseaseId" class="text-sm font-medium">Disease</label>
		<select id="diseaseId" name="diseaseId" required class={inputClass}>
			{#each diseases as disease (disease.id)}
				<option value={disease.id} selected={values.diseaseId === disease.id}>
					{disease.name}
				</option>
			{/each}
		</select>
		{#if errors.diseaseId}<p class="text-sm text-destructive">{errors.diseaseId}</p>{/if}
	</div>

	<div class="space-y-1.5">
		<label for="countyFips" class="text-sm font-medium">County</label>
		<!--
			A constrained select, not a text field. Everything on the map keys on FIPS, so
			this is the one input that must not accept free text.
		-->
		<select id="countyFips" name="countyFips" required class={inputClass}>
			<option value="" disabled selected={!values.countyFips}>Choose a county…</option>
			{#each byState as [stateName, options] (stateName)}
				<optgroup label={stateName}>
					{#each options as county (county.fips)}
						<option value={county.fips} selected={values.countyFips === county.fips}>
							{county.name}
						</option>
					{/each}
				</optgroup>
			{/each}
		</select>
		{#if errors.countyFips}<p class="text-sm text-destructive">{errors.countyFips}</p>{/if}
	</div>

	<div class="grid gap-5 sm:grid-cols-2">
		<div class="space-y-1.5">
			<label for="observedOn" class="text-sm font-medium">Observed on</label>
			<input
				id="observedOn"
				name="observedOn"
				type="date"
				required
				max={maxDate}
				value={values.observedOn ?? ''}
				class={inputClass}
			/>
			{#if errors.observedOn}<p class="text-sm text-destructive">{errors.observedOn}</p>{/if}
		</div>

		<div class="space-y-1.5">
			<label for="reportedOn" class="text-sm font-medium">
				Reported on <span class="font-normal text-muted-foreground">(optional)</span>
			</label>
			<input
				id="reportedOn"
				name="reportedOn"
				type="date"
				max={maxDate}
				value={values.reportedOn ?? ''}
				class={inputClass}
			/>
			{#if errors.reportedOn}<p class="text-sm text-destructive">{errors.reportedOn}</p>{/if}
		</div>
	</div>

	<!--
		Crop, operation type, and strain are free text by design. The datalists only offer
		values already in use so spellings converge; anything typed is still accepted.
	-->
	<div class="grid gap-5 sm:grid-cols-2">
		{#each [{ name: 'crop', label: 'Crop', list: suggestions.crop, hint: 'e.g. Potato, Cucurbits' }, { name: 'operationType', label: 'Operation type', list: suggestions.operationType, hint: 'e.g. Commercial farm, Home garden' }, { name: 'strain', label: 'Strain or lineage', list: suggestions.strain, hint: 'e.g. US-23 — leave blank if undetermined' }, { name: 'source', label: 'Source', list: suggestions.source, hint: 'Who confirmed the detection' }] as field (field.name)}
			<div class="space-y-1.5">
				<label for={field.name} class="text-sm font-medium">
					{field.label} <span class="font-normal text-muted-foreground">(optional)</span>
				</label>
				<input
					id={field.name}
					name={field.name}
					type="text"
					maxlength="120"
					list="{field.name}-options"
					value={values[field.name as 'crop'] ?? ''}
					class={inputClass}
				/>
				<datalist id="{field.name}-options">
					{#each field.list as option (option)}
						<option value={option}></option>
					{/each}
				</datalist>
				<p class="text-xs text-muted-foreground">{field.hint}</p>
				{#if errors[field.name as 'crop']}
					<p class="text-sm text-destructive">{errors[field.name as 'crop']}</p>
				{/if}
			</div>
		{/each}
	</div>

	<div class="space-y-1.5">
		<label for="comments" class="text-sm font-medium">
			Comments <span class="font-normal text-muted-foreground">(optional, shown publicly)</span>
		</label>
		<textarea
			id="comments"
			name="comments"
			rows="4"
			maxlength="2000"
			class={inputClass}
			value={values.comments ?? ''}></textarea>
		<p class="text-xs text-muted-foreground">
			Everything recorded here is public. Do not include farm names or addresses.
		</p>
		{#if errors.comments}<p class="text-sm text-destructive">{errors.comments}</p>{/if}
	</div>

	{#if duplicates.length}
		<div role="alert" class="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
			<p class="font-medium">
				{duplicates.length === 1 ? 'A detection' : `${duplicates.length} detections`} of this disease
				in this county on this date already {duplicates.length === 1 ? 'exists' : 'exist'}:
			</p>
			<ul class="mt-1.5 space-y-0.5">
				{#each duplicates as d (d.id)}
					<li>
						<a
							href={resolve('/admin/incidents/[id]', { id: String(d.id) })}
							class="font-mono text-xs underline">{d.publicId}</a
						>
						{[d.crop, d.strain].filter(Boolean).join(' · ') || ''}
					</li>
				{/each}
			</ul>
			<p class="mt-1.5 text-muted-foreground">
				If this is a separate confirmation (a different crop or field, say), add it anyway.
				Otherwise edit the existing one instead.
			</p>
		</div>
		<Button type="submit" name="confirmDuplicate" value="yes" disabled={submitting}>
			{submitting ? 'Saving…' : 'Add anyway'}
		</Button>
	{:else}
		<Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : submitLabel}</Button>
	{/if}
</form>
