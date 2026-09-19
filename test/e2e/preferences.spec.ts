import { expect, test } from '@playwright/test';

import { cardFor, displayName, fixture, openSite } from './helpers';

const titles = (page: Parameters<typeof openSite>[0]) => page.locator('.trail-card__title').allTextContents();

test.describe('reader preferences', () => {
	test('sort by name orders the cards alphabetically and survives a reload', async ({ page }) => {
		await openSite(page);
		await page.locator('.sort-control__select').selectOption('name');
		const expected = fixture.trails.map(displayName).sort((a, b) => a.localeCompare(b));
		expect(await titles(page)).toEqual(expected);

		await page.reload();
		await expect(page.locator('.trail-card')).toHaveCount(fixture.trails.length);
		await expect(page.locator('.sort-control__select')).toHaveValue('name');
		expect(await titles(page)).toEqual(expected);
	});

	test('the default sort puts the most recently updated card first', async ({ page }) => {
		await openSite(page);
		const newest = [...fixture.trails].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0];
		expect((await titles(page))[0]).toBe(displayName(newest));
	});

	test('the theme toggle switches palettes and is remembered', async ({ page }) => {
		await openSite(page);
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dracula');
		await page.locator('.theme-toggle').click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'alucard');

		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'alucard');
	});

	test('a starred trail pins to the top when favorites-first is on, and stays starred', async ({ page }) => {
		await openSite(page);
		const oldest = [...fixture.trails].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))[0];
		const card = cardFor(page, oldest);
		expect((await titles(page)).at(-1)).toBe(displayName(oldest));

		await card.locator('.trail-card__fav').click();
		await expect(card.locator('.trail-card__fav')).toHaveAttribute('aria-pressed', 'true');
		await page.locator('.fav-toggle').click();
		expect((await titles(page))[0]).toBe(displayName(oldest));

		await page.reload();
		await expect(page.locator('.trail-card')).toHaveCount(fixture.trails.length);
		expect((await titles(page))[0]).toBe(displayName(oldest));
		await expect(cardFor(page, oldest).locator('.trail-card__fav')).toHaveAttribute('aria-pressed', 'true');
	});
});
