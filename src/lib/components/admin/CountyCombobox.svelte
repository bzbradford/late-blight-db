<script lang="ts">
	import { countyLabel, MAX_MATCHES, searchCounties } from '$lib/counties/search';
	import type { CountyOption } from '$lib/server/queries/admin';

	type Props = {
		counties: CountyOption[];
		/** The chosen county's FIPS, or empty. */
		value?: string;
		/** Id of the visible text input, for the field's `<label for>`. */
		id: string;
		/** Name of the hidden input that carries the FIPS in the form post. */
		name: string;
		invalid?: boolean;
		class?: string;
		/** Called whenever the chosen county changes: its FIPS, or '' when un-chosen. */
		onchoose?: (fips: string) => void;
	};

	let {
		counties,
		value = '',
		id,
		name,
		invalid = false,
		class: className = '',
		onchoose
	}: Props = $props();

	/*
	 * A searchable picker, not a free-text field. Typing only filters the list; the form
	 * posts the hidden FIPS, which is set only by choosing a county. Everything on the map
	 * keys on FIPS, so this one input must never submit a typed name.
	 */

	let byFips = $derived(new Map(counties.map((c) => [c.fips, c])));

	// Derived from `value` (so a refused save's redisplay resets them) but writable, since
	// choosing and typing override them. Set synchronously, so the form's "unsaved
	// changes" snapshot on mount already includes the county.
	let fips = $derived(byFips.get(value)?.fips ?? '');
	let text = $derived.by(() => {
		const county = byFips.get(value);
		return county ? countyLabel(county) : '';
	});
	let open = $state(false);
	let active = $state(0);

	let input: HTMLInputElement | undefined = $state();
	let hidden: HTMLInputElement | undefined = $state();

	let matches = $derived(open ? searchCounties(counties, text) : []);
	let listId = $derived(`${id}-options`);

	// The browser refuses to submit while the text is not a chosen county.
	$effect(() => {
		input?.setCustomValidity(fips ? '' : 'Choose a county from the list.');
	});

	function choose(county: CountyOption) {
		fips = county.fips;
		text = countyLabel(county);
		open = false;
		onchoose?.(county.fips);
		// A programmatic value change fires no event; the form's change tracking needs one.
		queueMicrotask(() => hidden?.dispatchEvent(new Event('change', { bubbles: true })));
	}

	/**
	 * Chooses a county for the person, e.g. the one their coordinates fall in. Still only a
	 * county from the list: the hidden FIPS is never set to anything typed.
	 */
	export function select(countyFips: string) {
		const county = byFips.get(countyFips);
		if (county) choose(county);
	}

	function oninput(event: Event & { currentTarget: HTMLInputElement }) {
		text = event.currentTarget.value;
		// Editing the text un-chooses the county until one is picked again.
		if (fips) {
			fips = '';
			onchoose?.('');
			queueMicrotask(() => hidden?.dispatchEvent(new Event('change', { bubbles: true })));
		}
		open = true;
		active = 0;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (!open) open = true;
			else active = Math.min(active + 1, matches.length - 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			active = Math.max(active - 1, 0);
		} else if (event.key === 'Enter' && open && matches[active]) {
			// Choosing, not submitting.
			event.preventDefault();
			choose(matches[active]);
		} else if (event.key === 'Escape' && open) {
			// Close the list only; a surrounding dialog must not see this Escape.
			event.preventDefault();
			event.stopPropagation();
			open = false;
		}
	}

	function onblur() {
		open = false;
		// Leaving with an exact single match typed out chooses it; otherwise text stays for fixing.
		if (!fips) {
			const only = searchCounties(counties, text, 2);
			if (only.length === 1 && countyLabel(only[0]).toLowerCase() === text.trim().toLowerCase())
				choose(only[0]);
		}
	}

	// Keep the highlighted option in view while arrowing through the list.
	$effect(() => {
		if (!open) return;
		document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
	});
</script>

<div class="relative">
	<input
		bind:this={input}
		{id}
		type="text"
		role="combobox"
		autocomplete="off"
		spellcheck="false"
		required
		placeholder="Start typing a county name…"
		aria-autocomplete="list"
		aria-expanded={open && matches.length > 0}
		aria-controls={listId}
		aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
		aria-invalid={invalid || undefined}
		class={className}
		value={text}
		{oninput}
		{onkeydown}
		{onblur}
		onfocus={() => (open = text !== '' && !fips)}
	/>
	<input bind:this={hidden} type="hidden" {name} value={fips} />

	{#if open && text.trim() !== ''}
		<ul
			id={listId}
			role="listbox"
			class="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md"
		>
			{#each matches as county, i (county.fips)}
				<!-- Keyboard choice happens on the input (aria-activedescendant); options take pointer only. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id="{listId}-{i}"
					role="option"
					aria-selected={i === active}
					class="flex cursor-pointer items-baseline justify-between gap-3 rounded px-2 py-1.5 {i ===
					active
						? 'bg-muted'
						: ''}"
					onmousedown={(e) => e.preventDefault()}
					onmousemove={() => (active = i)}
					onclick={() => choose(county)}
				>
					<span>{county.name}</span>
					<span class="text-xs text-muted-foreground">{county.stateName}</span>
				</li>
			{:else}
				<li class="px-2 py-1.5 text-muted-foreground">No county matches “{text.trim()}”.</li>
			{/each}
			{#if matches.length === MAX_MATCHES}
				<li class="px-2 py-1.5 text-xs text-muted-foreground">Keep typing to narrow the list.</li>
			{/if}
		</ul>
	{/if}
</div>
