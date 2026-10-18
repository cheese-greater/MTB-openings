import { defineConfig, devices } from '@playwright/test';

// Browser tests run against the production build with trails.json intercepted per test.
export default defineConfig({
	forbidOnly: !!process.env.CI,
	fullyParallel: true,
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } }],
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	retries: process.env.CI ? 1 : 0,
	testDir: 'test/e2e',
	use: {
		baseURL: 'http://localhost:4173',
		// Blocked so the route interception, not the service worker, answers trails.json.
		serviceWorkers: 'block',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'yarn build && yarn preview --port 4173 --strictPort',
		reuseExistingServer: !process.env.CI,
		url: 'http://localhost:4173'
	}
});
