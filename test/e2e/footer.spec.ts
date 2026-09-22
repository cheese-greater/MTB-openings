import { expect, test } from '@playwright/test';

import packageJson from '../../package.json' with { type: 'json' };

import { openSite } from './helpers';

// The same field the build bakes in (vite.config.ts), read the same way.
const REPO_URL = packageJson.repository.url.replace(/\.git$/, '');

test.describe('site footer', () => {
	test('shows the version and links to the issue tracker and the source', async ({ page }) => {
		await openSite(page);
		const footer = page.locator('.site-footer');
		await expect(footer).toContainText(/v\d+\.\d+/);

		const issues = footer.getByRole('link', { name: 'Report an issue' });
		await expect(issues).toHaveAttribute('href', `${REPO_URL}/issues`);
		await expect(issues).toHaveAttribute('target', '_blank');

		const source = footer.getByRole('link', { name: 'Source on GitHub' });
		await expect(source).toHaveAttribute('href', REPO_URL);
		await expect(source).toHaveAttribute('target', '_blank');
		await expect(source.locator('svg')).toBeVisible();
	});
});
