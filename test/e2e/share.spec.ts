import { expect, test } from '@playwright/test';

import packageJson from '../../package.json' with { type: 'json' };

import { openSite } from './helpers';

const { homepage } = packageJson;

test.describe('share dialog', () => {
	test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

	test('shows the public address and QR code, copies the link, and closes', async ({ page }) => {
		await openSite(page);
		await page.locator('.qr-button').click();

		const dialog = page.getByRole('dialog', { name: 'Share this site' });
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('.qr-modal__url')).toHaveText(homepage);
		await expect(dialog.locator('.qr-modal__qr')).toHaveAttribute('alt', `QR code linking to ${homepage}`);
		await expect(dialog.locator('.qr-modal__qr')).toBeVisible();

		await dialog.locator('.qr-modal__copy').click();
		await expect(dialog.locator('.qr-modal__copy')).toHaveText('Copied!');
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(homepage);

		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(dialog).toBeHidden();
	});
});
