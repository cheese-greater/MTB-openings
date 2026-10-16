import { expect, test } from '@playwright/test';

import { openSite } from './helpers';

test.describe('installable app', () => {
	test('publishes a manifest named for the page, with icons that resolve', async ({ page, request }) => {
		await openSite(page);
		const href = await page.locator('link[rel="manifest"]').getAttribute('href');
		expect(href).toBeTruthy();
		const manifestUrl = new URL(href!, page.url());
		const manifest = await (await request.get(manifestUrl.toString())).json();
		expect(manifest.name).toBe(await page.title());
		expect(manifest.display).toBe('standalone');
		expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true);
		for (const icon of manifest.icons as { src: string }[]) {
			const response = await request.get(new URL(icon.src, manifestUrl).toString());
			expect(response.ok(), icon.src).toBe(true);
		}
		await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
	});

	test("colors the browser chrome with the theme's background, and follows the toggle", async ({ page }) => {
		await openSite(page);
		const themeColor = page.locator('meta[name="theme-color"]');
		await expect(themeColor).toHaveAttribute('content', '#282a36');
		await page.locator('.theme-toggle').click();
		await expect(themeColor).toHaveAttribute('content', '#fffbeb');
	});
});
