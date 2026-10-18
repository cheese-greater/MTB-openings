import { expect, test } from '@playwright/test';

import { cardFor, displayName, fixture, openSite } from './helpers';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

// Ages for the fixture's cards in name order, as the column writes them (see timeAgoCompact).
const AGES: { label: string; offset: number | null }[] = [
	{ label: '3h', offset: 3 * HOUR },
	{ label: '3h', offset: 3 * HOUR + 5 * 60 * 1000 },
	{ label: '2d', offset: 2 * DAY },
	{ label: '2d', offset: 2 * DAY + HOUR },
	{ label: '', offset: null },
	{ label: '3w', offset: 3 * WEEK },
	{ label: '3w', offset: 3 * WEEK + DAY },
	{ label: '2d', offset: 2 * DAY }
];

test.describe('the age column beside the list on a phone', () => {
	test.use({ viewport: { height: 844, width: 390 } });

	test('labels the line wherever the age changes from the card above', async ({ page }) => {
		const now = Date.now();
		const trails = [...fixture.trails]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((trail, index) => {
				const { offset } = AGES[index];
				return { ...trail, timestamp: offset == null ? null : now - offset };
			});
		await openSite(page, { ...fixture, trails });
		await page.locator('.sort-control__select').selectOption('name');
		expect(await page.locator('.trail-card__title').allTextContents()).toEqual(trails.map(displayName));

		let previousLabel = '';
		for (const [index, trail] of trails.entries()) {
			const { label } = AGES[index];
			const age = cardFor(page, trail).locator('.trail-card__age');
			if (label !== '' && label !== previousLabel) await expect(age).toHaveText(label);
			else await expect(age).toHaveCount(0);
			previousLabel = label;
		}
	});

	test('sits outside the cards, to their left', async ({ page }) => {
		await openSite(page);
		const first = page.locator('.trail-card').first();
		const label = await first.locator('.trail-card__age').boundingBox();
		const card = await first.boundingBox();
		expect(label).not.toBeNull();
		expect(card).not.toBeNull();
		expect(label!.x + label!.width).toBeLessThanOrEqual(card!.x);
	});
});

test('the age column stays off the desktop layout', async ({ page }) => {
	await openSite(page);
	await expect(page.locator('.trail-card__age')).toHaveCount(0);
});
