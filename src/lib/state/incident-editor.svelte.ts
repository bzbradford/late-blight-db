import { untrack } from 'svelte';
import { goto, preloadData, pushState } from '$app/navigation';
import { page } from '$app/state';
import type { AdminIncident, CountyOption } from '$lib/server/queries/admin';
import type { Disease } from '$lib/server/queries/diseases';

/** What `/admin/incidents/new` and `/admin/incidents/[id]` load — the editor modal's data. */
export type IncidentEditorData = {
	diseases: Disease[];
	counties: CountyOption[];
	suggestions: { crop: string[]; operationType: string[]; strain: string[]; source: string[] };
	maxDate: string;
	/** Absent when adding a detection. */
	incident?: AdminIncident;
};

/**
 * The add/edit modal, opened over whatever page the admin is on.
 *
 * The modal shows the real `/admin/incidents/new` and `/admin/incidents/[id]` pages: their
 * `load` supplies the data (via `preloadData`) and their form actions take the posts, so the
 * admin guard in `hooks.server.ts` covers every write exactly as it does for the full pages,
 * which still work on their own for direct links.
 *
 * Opening pushes a shallow history entry with an empty URL, so Back closes the modal and
 * the address bar never changes (the public map must always read `/`). SvelteKit does not
 * run `beforeNavigate` for a shallow entry, so a Back press with unsaved changes is caught
 * here instead: the entry is pushed again and the discard prompt shown.
 *
 * An instance per page, created during component setup (it registers an effect).
 */
export class IncidentEditor {
	current = $state.raw<{ href: string; data: IncidentEditorData } | null>(null);
	/** Fetching the editor's data. */
	loading = $state(false);
	/** Bound to the form: whether anything differs from what it opened with. */
	dirty = $state(false);
	/** A close was attempted with unsaved changes. */
	confirmingDiscard = $state(false);

	constructor() {
		$effect(() => {
			const open = page.state.incidentEditor === true;
			untrack(() => {
				if (open || !this.current) return;
				if (this.dirty) {
					pushState('', { incidentEditor: true });
					this.confirmingDiscard = true;
				} else {
					this.current = null;
				}
			});
		});
	}

	/**
	 * Opens the editor for an admin page URL. If its data cannot be loaded here (a
	 * signed-out session, a retracted-then-purged row), go to the page itself, which
	 * shows the login or the error properly.
	 */
	async open(href: string) {
		if (this.loading) return;
		this.loading = true;
		try {
			const result = await preloadData(href);
			if (result.type !== 'loaded' || result.status !== 200) {
				// Callers pass a path built with `resolve()`.
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				await goto(href);
				return;
			}
			this.current = { href, data: result.data as IncidentEditorData };
			this.dirty = false;
			this.confirmingDiscard = false;
			pushState('', { incidentEditor: true });
		} finally {
			this.loading = false;
		}
	}

	/** Close, unless that would lose unsaved changes — then ask first. */
	requestClose() {
		if (this.dirty) this.confirmingDiscard = true;
		else void this.#close();
	}

	keepEditing() {
		this.confirmingDiscard = false;
	}

	/** Close without saving, after the admin confirmed it. Also used once a write succeeds. */
	discard(): Promise<void> {
		this.dirty = false;
		this.confirmingDiscard = false;
		return this.#close();
	}

	/**
	 * Resolves once the modal's history entry is gone. Callers that refresh data must wait
	 * for this: SvelteKit's popstate handler resets its navigation token, which silently
	 * drops an `invalidateAll()` still in flight.
	 */
	#close(): Promise<void> {
		if (!page.state.incidentEditor) {
			this.current = null;
			return Promise.resolve();
		}
		// Popping our own history entry closes the modal through the effect above.
		const popped = new Promise<void>((done) =>
			addEventListener('popstate', () => done(), { once: true })
		);
		history.back();
		return popped;
	}
}
