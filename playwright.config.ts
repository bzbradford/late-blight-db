import { defineConfig } from '@playwright/test';

export default defineConfig({
	globalSetup: './e2e/global-setup.ts',
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	projects: [
		// Signs in the seeded accounts once; see e2e/sessions.ts.
		{ name: 'setup', testMatch: /auth\.setup\.ts/ },
		{ name: 'e2e', testMatch: '**/*.e2e.{ts,js}', dependencies: ['setup'] }
	]
});
