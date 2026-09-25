import { defineConfig } from '@playwright/test';

/**
 * The build and the server log to `e2e/.server.log` rather than the console: many tests
 * provoke failures on purpose (wrong passwords, refused actions, a 404), and the warnings
 * the server rightly logs for them buried the results. Read the file when a test fails or
 * the server will not start, or set `E2E_SERVER_LOGS=1` to stream it instead.
 */
const SERVER = 'pnpm build && pnpm preview';
const command = process.env.E2E_SERVER_LOGS ? SERVER : `(${SERVER}) > e2e/.server.log 2>&1`;

export default defineConfig({
	globalSetup: './e2e/global-setup.ts',
	webServer: {
		command,
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
