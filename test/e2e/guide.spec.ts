import { expect, test } from '@playwright/test';

import { fixture, openSite } from './helpers';

test.describe('feature guide', () => {
	test('opens from the header, walks through the page, and closes', async ({ page }) => {
		await openSite(page);
		await page.locator('.guide-button').click();

		const dialog = page.getByRole('dialog', { name: 'How it works' });
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('.guide-section__title')).toHaveText([
			'Where the word comes from',
			'Reading a card',
			'Around the page'
		]);
		await expect(dialog.locator('.guide-flow__source')).toHaveCount(5);
		await expect(dialog.locator('.guide-tile')).toHaveCount(9);
		// Every callout on the sample card has its line in the legend.
		const marks = await dialog.locator('.guide-mark').allTextContents();
		expect(marks).toEqual(['1', '2', '3', '4', '5', '6']);
		await expect(dialog.locator('.guide-legend > li')).toHaveCount(marks.length);
		await expect(dialog.getByRole('link', { name: 'Open an issue' })).toHaveAttribute('href', /\/issues$/);

		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(dialog).toHaveClass(/guide-dialog--closing/);
		await expect(dialog).toBeHidden();
	});

	test('back closes it and stays on the page, and closing it by its button leaves the history as it found it', async ({
		page
	}) => {
		await openSite(page);
		// The entry the open dialog holds is tagged; the page's own entry is not.
		const historyState = () => page.evaluate(() => window.history.state as unknown);
		const dialog = page.getByRole('dialog', { name: 'How it works' });
		expect(await historyState()).toBeNull();

		await page.locator('.guide-button').click();
		await expect(dialog).toBeVisible();
		expect(await historyState()).toEqual({ dialog: 'guide' });
		await page.goBack();
		await expect(dialog).toBeHidden();
		await expect(page.locator('.trail-card')).toHaveCount(fixture.trails.length);
		expect(await historyState()).toBeNull();

		await page.locator('.guide-button').click();
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(dialog).toBeHidden();
		await expect.poll(historyState).toBeNull();
	});
});
