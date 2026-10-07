<script lang="ts">
	import { onMount } from 'svelte';
	import LockIcon from '@lucide/svelte/icons/lock';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionResult } from '@sveltejs/kit';
	import CountyCombobox from '$lib/components/admin/CountyCombobox.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { CountyOption } from '$lib/server/queries/admin';
	import type { Disease } from '$lib/server/queries/diseases';
	import { loadCountyShapes } from '$lib/geo/client';
	import { formatCoordinates, parseCoordinates, type Point } from '$lib/geo/coordinates';
	import {
		checkLocation,
		correctedPoint,
		shapeLabel,
		TOLERANCE_KM,
		type CountyShape
	} from '$lib/geo/locate';
	import {
		reportedBeforeObserved,
		type FieldErrors,
		type IncidentInput
	} from '$lib/validation/incident';

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
		/**
		 * Handles the action's result instead of SvelteKit's default (follow the redirect,
		 * or set the page's `form`). A modal needs this: the page it sits on is not the page
		 * whose action it posted to.
		 */
		onResult?: (result: ActionResult) => void | Promise<void>;
		/** Called as fields change: whether anything differs from what the form opened with. */
		onDirtyChange?: (dirty: boolean) => void;
		/** Shows a Cancel button beside the submit button. */
		onCancel?: () => void;
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
		duplicates = [],
		onResult,
		onDirtyChange,
		onCancel
	}: Props = $props();

	// The two dates are tracked as they are typed, so an impossible pair blocks saving
	// before the round trip. The server applies the same rule regardless.
	let observedOn = $derived(values.observedOn ?? '');
	let reportedOn = $derived(values.reportedOn ?? '');
	let dateOrderError = $derived(reportedBeforeObserved(observedOn, reportedOn || null));

	let submitting = $state(false);
	let formEl: HTMLFormElement | undefined = $state();

	/**
	 * Compared against the opening snapshot rather than set on the first keystroke, so
	 * typing a change and then undoing it leaves nothing to discard.
	 */
	let snapshot = '';
	function serialize(form: HTMLFormElement) {
		return JSON.stringify([...new FormData(form).entries()].map(([k, v]) => [k, String(v)]));
	}
	function checkDirty() {
		if (formEl) onDirtyChange?.(serialize(formEl) !== snapshot);
	}
	onMount(() => {
		if (formEl) snapshot = serialize(formEl);
	});

	// --- Private coordinates -------------------------------------------------------------
	// Checked against the county as they're typed (the server checks again on save). With
	// no county chosen yet, the one they fall in is chosen for the person.

	let county: CountyCombobox | undefined = $state();
	let chosenFips = $derived(values.countyFips ?? '');
	let coordinates = $derived(values.location ? formatCoordinates(values.location) : '');
	/** "Use these coordinates anyway", for a point a few km outside the county. */
	let confirmed = $state(false);
	/** Choose a county from the coordinates once the check can run, if none is chosen. */
	let autoChoose = $state(false);

	let shapes = $state<CountyShape[] | null>(null);
	let shapesFailed = $state(false);

	let parsed = $derived(coordinates.trim() ? parseCoordinates(coordinates) : null);
	let point = $derived(parsed && 'point' in parsed ? parsed.point : null);
	let check = $derived(shapes && point ? checkLocation(shapes, point, chosenFips || null) : null);
	/** The minus sign or the order slipped: offered when the point lands in no county. */
	let correction = $derived(
		shapes &&
			point &&
			check &&
			check.kind !== 'match' &&
			check.kind !== 'confirm' &&
			!('inside' in check && check.inside) &&
			!(check.nearest && check.nearest.km <= TOLERANCE_KM)
			? correctedPoint(shapes, point)
			: null
	);
	let locationBlocks = $derived(
		Boolean(parsed && 'error' in parsed) ||
			check?.kind === 'mismatch' ||
			(check?.kind === 'confirm' && !confirmed)
	);

	$effect(() => {
		if (!point || shapes || shapesFailed) return;
		loadCountyShapes()
			.then((s) => (shapes = s))
			.catch(() => (shapesFailed = true));
	});

	$effect(() => {
		if (!autoChoose || !check) return;
		autoChoose = false;
		if (check.kind === 'unchosen' && check.nearest && check.nearest.km <= TOLERANCE_KM) {
			county?.select(check.nearest.shape.fips);
		}
	});

	function setCoordinates(text: string) {
		coordinates = text;
		confirmed = false;
		autoChoose = !chosenFips;
	}

	function useCounty(fips: string) {
		county?.select(fips);
	}

	function useCorrection(p: Point) {
		setCoordinates(formatCoordinates(p));
		// No input event fires for a programmatic change; the dirty check needs one.
		queueMicrotask(checkDirty);
	}

	function clearCoordinates() {
		setCoordinates('');
		queueMicrotask(checkDirty);
	}

	function km(n: number) {
		return `${n < 10 ? n.toFixed(1) : Math.round(n)} km`;
	}

	/** The check's verdict in words; the markup adds the buttons that act on it. */
	let verdict = $derived.by(() => {
		if (!check) return '';
		switch (check.kind) {
			case 'match':
				return check.km === 0
					? `In ${shapeLabel(check.county)}.`
					: `${km(check.km)} outside ${shapeLabel(check.county)} on this map, whose borders are approximate — close enough.`;
			case 'unchosen':
				return check.nearest
					? `These coordinates are in no county on this map. The nearest is ${shapeLabel(check.nearest.shape)}, ${km(check.nearest.km)} away.`
					: 'These coordinates are not in any county on this map.';
			case 'confirm':
				return `These coordinates are ${km(check.km)} outside ${shapeLabel(check.county)}${check.inside ? `, in ${shapeLabel(check.inside)}` : ''}. Near coasts and islands the map's simplified borders can do this.`;
			case 'mismatch': {
				const chosen = check.chosen ? `, not ${shapeLabel(check.chosen)}` : '';
				if (check.inside) return `These coordinates are in ${shapeLabel(check.inside)}${chosen}.`;
				if (check.nearest) {
					return `These coordinates are ${km(check.nearest.km)} from ${shapeLabel(check.nearest.shape)}${chosen}.`;
				}
				return 'These coordinates are not in any county on this map.';
			}
		}
	});

	const inputClass =
		'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
</script>

<form
	bind:this={formEl}
	method="POST"
	{action}
	class="space-y-5"
	oninput={checkDirty}
	onchange={checkDirty}
	use:enhance={() => {
		submitting = true;
		return async ({ result, update }) => {
			if (onResult) await onResult(result);
			else await update();
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
			Searchable, but still constrained: only a chosen county's FIPS is posted. Everything
			on the map keys on FIPS, so this is the one input that must not accept free text.
		-->
		<CountyCombobox
			bind:this={county}
			id="countyFips"
			name="countyFips"
			{counties}
			value={values.countyFips ?? ''}
			invalid={Boolean(errors.countyFips)}
			class={inputClass}
			onchoose={(fips) => {
				chosenFips = fips;
				confirmed = false;
			}}
		/>
		{#if errors.countyFips}<p class="text-sm text-destructive">{errors.countyFips}</p>{/if}
	</div>

	<div class="space-y-1.5">
		<label for="coordinates" class="flex items-center gap-1.5 text-sm font-medium">
			<LockIcon class="size-3.5 text-muted-foreground" aria-hidden="true" />
			Coordinates <span class="font-normal text-muted-foreground">(optional, private)</span>
		</label>
		<input
			id="coordinates"
			name="coordinates"
			type="text"
			inputmode="decimal"
			autocomplete="off"
			spellcheck="false"
			placeholder="43.0731, -89.4012"
			value={coordinates}
			oninput={(e) => setCoordinates(e.currentTarget.value)}
			aria-invalid={locationBlocks || Boolean(errors.location) || undefined}
			aria-describedby="coordinates-hint"
			class={inputClass}
		/>
		<p id="coordinates-hint" class="text-xs text-muted-foreground">
			Latitude, longitude in decimal degrees. Seen only by admins and whoever entered this detection
			— never on the public map or in public downloads.
		</p>

		{#if confirmed}<input type="hidden" name="confirmLocation" value="yes" />{/if}

		<div aria-live="polite">
			{#if parsed && 'error' in parsed}
				<p class="text-sm text-destructive">{parsed.error}</p>
			{:else if check?.kind === 'match'}
				<p class="text-sm text-muted-foreground">{verdict}</p>
			{:else if check?.kind === 'unchosen'}
				{#if check.nearest && check.nearest.km > TOLERANCE_KM}
					<div
						role="alert"
						class="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
					>
						<p>{verdict}</p>
						<button
							type="button"
							class="mt-1.5 font-medium underline underline-offset-4"
							onclick={() =>
								check?.kind === 'unchosen' && check.nearest && useCounty(check.nearest.shape.fips)}
							>Use {check.nearest.shape.name}</button
						>
					</div>
				{:else if !check.nearest}
					<p role="alert" class="text-sm text-destructive">{verdict}</p>
				{/if}
			{:else if check?.kind === 'confirm'}
				<div
					role="alert"
					class="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm {confirmed
						? 'opacity-70'
						: ''}"
				>
					<p>{verdict}</p>
					<div class="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
						{#if confirmed}
							<span class="font-medium">Keeping {check.county.name}.</span>
						{:else}
							<button
								type="button"
								class="font-medium underline underline-offset-4"
								onclick={() => (confirmed = true)}>Use these coordinates anyway</button
							>
						{/if}
						{#if check.inside}
							{@const inside = check.inside}
							<button
								type="button"
								class="font-medium underline underline-offset-4"
								onclick={() => useCounty(inside.fips)}>Use {inside.name}</button
							>
						{/if}
						<button
							type="button"
							class="font-medium underline underline-offset-4"
							onclick={clearCoordinates}>Clear coordinates</button
						>
					</div>
				</div>
			{:else if check?.kind === 'mismatch'}
				<div
					role="alert"
					class="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm"
				>
					<p>{verdict} Fix the county or the coordinates to save.</p>
					<div class="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
						{#if check.inside ?? check.nearest?.shape}
							{@const target = (check.inside ?? check.nearest?.shape)!}
							<button
								type="button"
								class="font-medium underline underline-offset-4"
								onclick={() => useCounty(target.fips)}>Use {target.name}</button
							>
						{/if}
						<button
							type="button"
							class="font-medium underline underline-offset-4"
							onclick={clearCoordinates}>Clear coordinates</button
						>
					</div>
				</div>
			{:else if errors.location}
				<p class="text-sm text-destructive">{errors.location}</p>
			{:else if point && shapesFailed}
				<p class="text-sm text-muted-foreground">
					Couldn't load the county map to check these here; they'll be checked when you save.
				</p>
			{/if}

			{#if correction}
				{@const fix = correction}
				<p class="mt-1.5 text-sm">
					Did you mean
					<button
						type="button"
						class="font-medium underline underline-offset-4"
						onclick={() => useCorrection(fix)}>{formatCoordinates(fix)}</button
					>
					({shapeLabel(fix.county)})?
				</p>
			{/if}
		</div>
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
				value={observedOn}
				oninput={(e) => (observedOn = e.currentTarget.value)}
				class={inputClass}
			/>
			{#if errors.observedOn}<p class="text-sm text-destructive">{errors.observedOn}</p>{/if}
		</div>

		<div class="space-y-1.5">
			<label for="reportedOn" class="text-sm font-medium"> Reported on </label>
			<input
				id="reportedOn"
				name="reportedOn"
				type="date"
				required
				min={observedOn || undefined}
				max={maxDate}
				value={reportedOn}
				oninput={(e) => (reportedOn = e.currentTarget.value)}
				aria-invalid={Boolean(dateOrderError ?? errors.reportedOn) || undefined}
				class={inputClass}
			/>
			{#if dateOrderError ?? errors.reportedOn}
				<p role="alert" class="text-sm text-destructive">{dateOrderError ?? errors.reportedOn}</p>
			{/if}
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
							target="_blank"
							rel="noopener"
							title="Opens in a new tab, so this entry is kept"
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
	{/if}

	<div class="flex items-center gap-2">
		{#if duplicates.length}
			<Button
				type="submit"
				name="confirmDuplicate"
				value="yes"
				disabled={submitting || Boolean(dateOrderError) || locationBlocks}
			>
				{submitting ? 'Saving…' : 'Add anyway'}
			</Button>
		{:else}
			<Button type="submit" disabled={submitting || Boolean(dateOrderError) || locationBlocks}>
				{submitting ? 'Saving…' : submitLabel}
			</Button>
		{/if}
		{#if onCancel}
			<Button type="button" variant="outline" onclick={onCancel}>Cancel</Button>
		{/if}
	</div>
</form>
