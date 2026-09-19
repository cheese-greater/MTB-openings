import { defineConfig, devices } from '@playwright/test';

// Browser tests run against the production build served by `vite preview`, with
// trails.json intercepted per test (test/e2e/helpers.ts) so nothing here touches
// a live source. They run from .github/workflows/test.yml on push and pull
// request, never from the hourly publish workflow.
export default defineConfig({
	forbidOnly: !!process.env.CI,
	fullyParallel: true,
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } }],
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	retries: process.env.CI ? 1 : 0,
	testDir: 'test/e2e',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'yarn build && yarn preview --port 4173 --strictPort',
		reuseExistingServer: !process.env.CI,
		url: 'http://localhost:4173'
	}
});
