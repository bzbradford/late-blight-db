import type { auth } from '$lib/server/auth';

type AuthSession = typeof auth.$Infer.Session;

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			/** Signed in and not deactivated. `role` is checked against ROLES on arrival. */
			user?: AuthSession['user'] & { role: import('$lib/auth/roles').Role };
			session?: AuthSession['session'];
		}

		// interface Error {}
		// interface PageData {}
		interface PageState {
			/** An incident editor modal is open — see `$lib/state/incident-editor.svelte`. */
			incidentEditor?: boolean;
		}
		// interface Platform {}
	}
}

export {};
