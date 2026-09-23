/**
 * Light/dark theme.
 *
 * The first decision is made before paint by the inline script in `src/app.html`, which
 * sets `.dark` on `<html>` — waiting for hydration would flash the wrong theme on every
 * load. This module takes over from there: it reads what the script decided and stores
 * the visitor's choice when they toggle. The default is light; the OS setting is not
 * consulted.
 *
 * A module-level instance is safe here, unlike `ViewState`: it is only ever written in
 * the browser, so the server never renders one visitor's theme into another's page.
 * Markup that must match the theme on first paint (the toggle's icon) is driven by the
 * `.dark` class in CSS, not by `current`, which is still `light` during SSR.
 */
export type Theme = 'light' | 'dark';

/** Must match the key read by the inline script in `src/app.html`. */
const STORAGE_KEY = 'theme';

class ThemeState {
	current = $state<Theme>('light');
	#started = false;

	/** Call once in the browser, from the root layout. */
	start() {
		if (this.#started) return;
		this.#started = true;
		this.current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
	}

	toggle() {
		const next: Theme = this.current === 'dark' ? 'light' : 'dark';
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// Storage can be blocked (private windows, strict settings). The toggle still
			// works for this page view; it just won't be remembered.
		}
		this.#apply(next);
	}

	#apply(theme: Theme) {
		const root = document.documentElement;
		root.classList.toggle('dark', theme === 'dark');
		root.style.colorScheme = theme;
		this.current = theme;
	}
}

export const theme = new ThemeState();
