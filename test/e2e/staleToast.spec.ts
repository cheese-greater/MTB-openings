import { expect, test } from '@playwright/test';

import packageJson from '../../package.json' with { type: 'json' };

import { fixture, openSite } from './helpers';

const HOUR = 60 * 60 * 1000;

// The same field the build bakes in (vite.config.ts), read the same way.
const REPO_URL = packageJson.repository.url.replace(/\.git$/, '');

test.describe('stale conditions notice', () => {
	test('stays quiet while the hourly publish is keeping up', async ({ page }) => {
		await openSite(page, { ...fixture, cachedAt: Date.now() - 1.5 * HOUR });
		await expect(page.locator('.stale-toast')).toHaveCount(0);
		await expect(page.locator('.site-footer__cache')).not.toHaveClass(/site-footer__cache--stale/);
	});

	test('pops up on load when the conditions are hours old, and closes from its button', async ({ page }) => {
		const cachedAt = Date.now() - 5 * HOUR;
		await openSite(page, { ...fixture, cachedAt });
		const toast = page.getByRole('alert');
		const title = toast.locator('.stale-toast__title');
		const body = toast.locator('.stale-toast__body');
		await expect(title).toHaveText('Hourly cache is 5 hours old');
		await expect(body).toHaveText('If this keeps happening, please report it.');
		// The title sits on its own line above the body.
		const titleBox = (await title.boundingBox())!;
		const bodyBox = (await body.boundingBox())!;
		expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(bodyBox.y + 1);
		const report = toast.getByRole('link', { name: 'report it' });
		await expect(report).toHaveAttribute('href', `${REPO_URL}/issues`);
		await expect(report).toHaveAttribute('target', '_blank');
		// Dracula's caution orange, so it reads as a warning.
		await expect(toast).toHaveCSS('background-color', 'rgb(255, 184, 108)');
		await expect(toast.locator('.stale-toast__icon')).toBeVisible();

		await toast.getByRole('button', { name: 'Close' }).click();
		await expect(page.locator('.stale-toast')).toHaveCount(0);
	});

	test('goes away on its own after a few seconds', async ({ page }) => {
		await page.clock.install();
		await openSite(page, { ...fixture, cachedAt: Date.now() - 5 * HOUR });
		await expect(page.getByRole('alert')).toBeVisible();
		await page.clock.fastForward(8000);
		await expect(page.locator('.stale-toast')).toHaveCount(0);
	});

	test('turns the cache line in the footer red', async ({ page }) => {
		await openSite(page, { ...fixture, cachedAt: Date.now() - 5 * HOUR });
		const cacheLine = page.locator('.site-footer__cache');
		await expect(cacheLine).toHaveText('Last hourly cache: 5 hours ago');
		await expect(cacheLine).toHaveClass(/site-footer__cache--stale/);
		await expect(cacheLine).toHaveCSS('color', 'rgb(255, 85, 85)');
	});

	test('does not read a clock behind the publish as staleness', async ({ page }) => {
		await openSite(page, { ...fixture, cachedAt: Date.now() + 3 * HOUR });
		await expect(page.locator('.stale-toast')).toHaveCount(0);
		await expect(page.locator('.site-footer__cache')).not.toHaveClass(/site-footer__cache--stale/);
	});
});
