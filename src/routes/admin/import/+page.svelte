<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { differingFields, type Choice, type ImportItem, type Match } from '$lib/import/classify';
	import type { IncidentInput } from '$lib/validation/incident';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);

	let review = $derived(form?.stage === 'review' ? form : null);
	let items = $derived(review?.items ?? []);
	let conflicts = $derived(
		items.filter((i): i is Extract<ImportItem, { kind: 'conflict' }> => i.kind === 'conflict')
	);
	let newRows = $derived(items.filter((i) => i.kind === 'new'));
	let identicalCount = $derived(items.filter((i) => i.kind === 'identical').length);

	/**
	 * The admin's pick per conflicting row, keyed by spreadsheet row number. Derived so a
	 * fresh review (or a stale one re-shown) starts from each row's safe default; writable
	 * so the admin can change it. Not deeply reactive — always reassign, never mutate.
	 */
	let choices = $derived<Record<number, Choice>>(
		Object.fromEntries(conflicts.map((c) => [c.row.row, c.defaultChoice]))
	);

	function choose(row: number, choice: Choice) {
		choices = { ...choices, [row]: choice };
	}

	let toAdd = $derived(
		newRows.length + conflicts.filter((c) => choices[c.row.row] === 'keep_both').length
	);
	let toUpdate = $derived(conflicts.filter((c) => choices[c.row.row] === 'keep_new').length);

	function setAll(choice: Choice) {
		const next = { ...choices };
		for (const c of conflicts) if (c.choices.includes(choice)) next[c.row.row] = choice;
		choices = next;
	}

	const CHOICE_LABELS: Record<Choice, string> = {
		keep_existing: 'Keep existing',
		keep_new: 'Replace with this row',
		keep_both: 'Add as a separate detection'
	};

	function choiceLabel(choice: Choice, match: Match) {
		if (match.source === 'file' && choice === 'keep_existing') return 'Skip this row';
		return CHOICE_LABELS[choice];
	}

	const SHOWN_FIELDS: { key: keyof IncidentInput; label: string }[] = [
		{ key: 'observedOn', label: 'Observed' },
		{ key: 'reportedOn', label: 'Reported' },
		{ key: 'crop', label: 'Crop' },
		{ key: 'operationType', label: 'Operation' },
		{ key: 'strain', label: 'Strain' },
		{ key: 'source', label: 'Source' },
		{ key: 'comments', label: 'Comments' }
	];

	type Other = {
		heading: string;
		values: IncidentInput;
		/** Only rows from the database carry labels; file matches share the row's key. */
		label?: { disease: string; county: string };
	};

	function matchRows(match: Match): Other[] {
		return match.source === 'file'
			? [{ heading: `Row ${match.row} of this file`, values: match.values }]
			: match.rows.map((r) => ({
					heading: `Detection ${r.publicId}${r.deletedAt ? ' (retracted)' : ''}`,
					values: r,
					label: r.label
				}));
	}

	const KEY_ROWS = [
		{ label: 'Disease', field: 'disease', key: 'diseaseId' },
		{ label: 'County', field: 'county', key: 'countyFips' }
	] as const;

	/** Disease/county rows, shown only when an id-matched row moves the detection. */
	function keyRows(item: Extract<ImportItem, { kind: 'conflict' }>, others: Other[]) {
		return KEY_ROWS.filter((r) =>
			others.some((o) => differingFields(o.values, item.row.values).includes(r.key))
		);
	}

	function show(value: unknown) {
		return value === null || value === undefined || value === '' ? '—' : String(value);
	}
</script>

<svelte:head><title>Import detections</title></svelte:head>

<main class="mx-auto max-w-5xl px-4 py-8">
	<h1 class="text-xl font-semibold tracking-tight">Import detections</h1>

	{#if form?.stage === 'done'}
		<section class="mt-6 rounded-lg border p-4" aria-live="polite">
			<h2 class="font-medium">Imported {form.fileName}</h2>
			<ul class="mt-2 space-y-0.5 text-sm">
				<li>{form.summary.added} added</li>
				<li>{form.summary.updated} updated</li>
				<li>{form.summary.identical} already present, skipped</li>
				<li>{form.summary.kept} kept as they were</li>
			</ul>
			<div class="mt-4 flex gap-2">
				<Button href={resolve('/detections')}>View detections</Button>
				<Button variant="outline" href={resolve('/admin/import')}>Import another file</Button>
			</div>
		</section>
	{:else if review}
		<section class="mt-6">
			<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<h2 class="font-medium">Review {review.fileName}</h2>
				<a href={resolve('/admin/import')} class="text-sm text-muted-foreground underline">
					Choose a different file
				</a>
			</div>

			{#if review.stale}
				<p
					role="alert"
					class="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
				>
					Detections matched by this file changed while you were reviewing it. Check the rows below
					again — your choices have been reset.
				</p>
			{/if}

			<ul class="mt-3 flex flex-wrap gap-2 text-sm">
				<li class="rounded-md bg-muted px-2 py-1">{newRows.length} new</li>
				<li class="rounded-md bg-muted px-2 py-1">{identicalCount} already present</li>
				<li
					class="rounded-md px-2 py-1 {conflicts.length
						? 'bg-amber-500/15 text-amber-900 dark:text-amber-200'
						: 'bg-muted'}"
				>
					{conflicts.length}
					{conflicts.length === 1 ? 'needs a decision' : 'need a decision'}
				</li>
			</ul>

			<form
				method="POST"
				action="?/confirm"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<input type="hidden" name="csv" value={review.csv} />
				<input type="hidden" name="fileName" value={review.fileName} />
				<input type="hidden" name="signature" value={review.signature} />

				{#if conflicts.length}
					<div class="mt-6 flex flex-wrap items-center gap-2">
						<h3 class="mr-auto font-medium">Rows that match existing detections</h3>
						<span class="text-sm text-muted-foreground">Apply to all:</span>
						<Button variant="outline" size="sm" onclick={() => setAll('keep_existing')}>
							Keep existing
						</Button>
						<Button variant="outline" size="sm" onclick={() => setAll('keep_new')}>Replace</Button>
						<Button variant="outline" size="sm" onclick={() => setAll('keep_both')}>
							Keep both
						</Button>
					</div>

					<ol class="mt-3 space-y-4">
						{#each conflicts as item (item.row.row)}
							{@const others = matchRows(item.match)}
							<li class="rounded-lg border p-4" data-row={item.row.row}>
								<p class="text-sm font-medium">
									Row {item.row.row}: {item.row.label.disease}, {item.row.label.county}
								</p>
								<p class="text-xs text-muted-foreground">
									{#if item.byId}
										Matched by id.
									{:else if item.match.source === 'file'}
										Same disease, county, and date as an earlier row of this file.
									{:else if item.retracted}
										Matches a detection that was retracted. Keeping it retracted is the default.
									{:else}
										Same disease, county, and date as an existing detection.
									{/if}
									{#if item.match.source === 'database' && item.match.rows.length > 1}
										Several detections match, so this row can't say which one to replace — to
										replace one, put its id in the file.
									{/if}
									{#if item.byId && item.retracted}
										That detection is retracted; restore it from its admin page before updating it.
									{/if}
								</p>

								<div class="mt-3 overflow-x-auto">
									<table class="w-full text-left text-xs">
										<thead class="text-muted-foreground">
											<tr>
												<th class="py-1 pr-3 font-normal"></th>
												{#each others as other (other.heading)}
													<th class="py-1 pr-3 font-medium">{other.heading}</th>
												{/each}
												<th class="py-1 pr-3 font-medium">This file, row {item.row.row}</th>
											</tr>
										</thead>
										<tbody>
											{#each keyRows(item, others) as keyRow (keyRow.key)}
												<tr class="border-t bg-amber-500/10 align-top">
													<th class="py-1 pr-3 font-normal text-muted-foreground">{keyRow.label}</th
													>
													{#each others as other (other.heading)}
														<td class="py-1 pr-3">{show(other.label?.[keyRow.field])}</td>
													{/each}
													<td class="py-1 pr-3 font-medium">{item.row.label[keyRow.field]}</td>
												</tr>
											{/each}
											{#each SHOWN_FIELDS as field (field.key)}
												{@const differs = others.some((o) =>
													differingFields(o.values, item.row.values).includes(field.key)
												)}
												<tr class="border-t align-top {differs ? 'bg-amber-500/10' : ''}">
													<th class="py-1 pr-3 font-normal text-muted-foreground">{field.label}</th>
													{#each others as other (other.heading)}
														<td class="py-1 pr-3 whitespace-pre-line"
															>{show(other.values[field.key])}</td
														>
													{/each}
													<td class="py-1 pr-3 whitespace-pre-line {differs ? 'font-medium' : ''}">
														{show(item.row.values[field.key])}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>

								<fieldset class="mt-3 flex flex-wrap gap-x-5 gap-y-1">
									<legend class="sr-only">What to do with row {item.row.row}</legend>
									{#each item.choices as choice (choice)}
										<label class="flex items-center gap-1.5 text-sm">
											<input
												type="radio"
												name="choice-{item.row.row}"
												value={choice}
												checked={choices[item.row.row] === choice}
												onchange={() => choose(item.row.row, choice)}
											/>
											{choiceLabel(choice, item.match)}
										</label>
									{/each}
								</fieldset>
							</li>
						{/each}
					</ol>
				{/if}

				{#if newRows.length}
					<details class="mt-6 rounded-lg border p-4" open={newRows.length <= 20}>
						<summary class="cursor-pointer font-medium">
							{newRows.length} new {newRows.length === 1 ? 'detection' : 'detections'}
						</summary>
						<div class="mt-3 overflow-x-auto">
							<table class="w-full text-left text-xs">
								<thead class="text-muted-foreground">
									<tr>
										<th class="py-1 pr-3 font-normal">Row</th>
										<th class="py-1 pr-3 font-normal">Disease</th>
										<th class="py-1 pr-3 font-normal">County</th>
										<th class="py-1 pr-3 font-normal">Observed</th>
										<th class="py-1 pr-3 font-normal">Crop</th>
										<th class="py-1 pr-3 font-normal">Strain</th>
									</tr>
								</thead>
								<tbody>
									{#each newRows as item (item.row.row)}
										<tr class="border-t">
											<td class="py-1 pr-3">{item.row.row}</td>
											<td class="py-1 pr-3">{item.row.label.disease}</td>
											<td class="py-1 pr-3">{item.row.label.county}</td>
											<td class="py-1 pr-3">{item.row.values.observedOn}</td>
											<td class="py-1 pr-3">{show(item.row.values.crop)}</td>
											<td class="py-1 pr-3">{show(item.row.values.strain)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</details>
				{/if}

				<div class="mt-6 flex flex-wrap items-center gap-3">
					<Button type="submit" disabled={submitting || toAdd + toUpdate === 0}>
						{#if toAdd + toUpdate === 0}
							Nothing to import
						{:else}
							Import: add {toAdd}{toUpdate ? `, update ${toUpdate}` : ''}
						{/if}
					</Button>
					<p class="text-xs text-muted-foreground">
						Everything is written together, or nothing is. Each change is recorded in the audit log
						with this file's name and row.
					</p>
				</div>
			</form>
		</section>
	{:else}
		<p class="mt-2 max-w-2xl text-sm text-muted-foreground">
			Add many detections at once from a spreadsheet — for example, when first loading curated
			reports. Rows are checked against existing detections before anything is saved, and nothing is
			written until you confirm.
		</p>

		<div class="mt-4 flex flex-wrap gap-2">
			<!-- A download, not a page: plain links so SvelteKit does not try to route them. -->
			<Button variant="outline" size="sm" href="/admin/import/template.csv" data-sveltekit-reload>
				Download template
			</Button>
		</div>

		<details class="mt-4 max-w-2xl text-sm">
			<summary class="cursor-pointer font-medium">What goes in each column</summary>
			<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-muted-foreground">
				<dt class="font-mono text-xs text-foreground">id</dt>
				<dd>
					Leave blank for new detections. Filled in on downloads — keep it to update that detection.
				</dd>
				<dt class="font-mono text-xs text-foreground">disease</dt>
				<dd><code>late-blight</code> or <code>cucurbit-downy-mildew</code> (or the full name).</dd>
				<dt class="font-mono text-xs text-foreground">county_fips</dt>
				<dd>
					5-digit county FIPS code, or <code>C</code> + a Canadian census division's code (<code
						>C3506</code
					>). Or leave blank and give <code>state</code> + <code>county</code>.
				</dd>
				<dt class="font-mono text-xs text-foreground">state, county</dt>
				<dd>
					e.g. <code>WI</code> or <code>Wisconsin</code>, and <code>Dane</code> or
					<code>Dane County</code>; for Canada, <code>ON</code> or <code>Ontario</code>, and
					<code>Ottawa</code>.
				</dd>
				<dt class="font-mono text-xs text-foreground">observed_on</dt>
				<dd>Required. <code>YYYY-MM-DD</code>.</dd>
				<dt class="font-mono text-xs text-foreground">reported_on</dt>
				<dd>
					Optional. <code>YYYY-MM-DD</code>. Left blank, it takes the <code>observed_on</code> date.
				</dd>
				<dt class="font-mono text-xs text-foreground">
					crop, operation_type, strain, source, comments
				</dt>
				<dd>Optional free text.</dd>
			</dl>
			<p class="mt-2 text-muted-foreground">
				Up to {data.maxRows.toLocaleString()} rows and {data.maxBytes / 1024} KB per file.
			</p>
		</details>

		<form
			method="POST"
			action="?/review"
			enctype="multipart/form-data"
			class="mt-6 flex flex-wrap items-end gap-3"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update({ reset: false });
					submitting = false;
				};
			}}
		>
			<div class="space-y-1">
				<label for="file" class="text-sm font-medium">CSV file</label>
				<input
					id="file"
					name="file"
					type="file"
					accept=".csv,text/csv"
					required
					class="block text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
				/>
			</div>
			<Button type="submit" disabled={submitting}>{submitting ? 'Checking…' : 'Check file'}</Button>
		</form>

		{#if form?.stage === 'errors'}
			<section class="mt-6 rounded-lg border border-destructive/40 p-4" role="alert">
				<h2 class="font-medium">
					{form.fileName ? `${form.fileName} can't be imported yet` : "The file can't be imported"}
				</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Nothing was saved. Fix these in the spreadsheet and check the file again.
				</p>
				{#if form.fileErrors.length}
					<ul class="mt-3 list-disc pl-5 text-sm">
						{#each form.fileErrors as message (message)}<li>{message}</li>{/each}
					</ul>
				{/if}
				{#if form.rowErrors.length}
					<ul class="mt-3 space-y-1.5 text-sm">
						{#each form.rowErrors as error (error.row)}
							<li>
								<span class="font-medium">Row {error.row}:</span>
								{error.messages.join(' ')}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	{/if}
</main>
