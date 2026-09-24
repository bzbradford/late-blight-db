import { defineConfig } from '@playwright/test';

export default defineConfig({
	globalSetup: './e2e/global-setup.ts',
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		// Better Auth serves /api/auth/* only on its own origin; with .env's dev-server
		// ORIGIN those requests would fall through to SvelteKit's 404 page.
		env: { ORIGIN: 'http://localhost:4173' }
	},
	projects: [
		// Signs in the seeded accounts once; see e2e/sessions.ts.
		{ name: 'setup', testMatch: /auth\.setup\.ts/ },
		{ name: 'e2e', testMatch: '**/*.e2e.{ts,js}', dependencies: ['setup'] }
	]
});
