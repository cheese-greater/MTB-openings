import { devices, expect, test } from '@playwright/test';

import { cardFor, fixture, openSite } from './helpers';

const STATUS_LABEL: Record<string, string> = { caution: 'Caution', closed: 'Closed', open: 'Open', stale: 'Stale' };

// A device profile sets the browser type too, which Playwright only allows at
// file level, so the whole file is the phone layout.
test.use({ ...devices['Pixel 7'] });

test.describe('phone layout', () => {
	test('cards collapse to a summary row and open on tap', async ({ page }) => {
		await openSite(page);
		const trail = fixture.trails.find((candidate) => candidate.weather)!;
		const card = cardFor(page, trail);
		const details = card.locator('.trail-card__details');

		await expect(card.locator('.trail-card__badge')).toBeVisible();
		await expect(details).toBeHidden();

		await card.locator('.trail-card__summary').tap();
		await expect(card.locator('.trail-card__summary')).toHaveAttribute('aria-expanded', 'true');
		await expect(details).toBeVisible();
		await expect(card.locator('.trail-card__location')).toBeVisible();
		await expect(card.locator('.trail-card__weather')).toBeVisible();
		await expect(card.locator('.trail-card__source')).toBeVisible();

		await card.locator('.trail-card__summary').tap();
		await expect(details).toBeHidden();
	});

	test('the status shows as an icon until the card opens, and reads in full to assistive tech', async ({ page }) => {
		await openSite(page);
		const trail = fixture.trails[0];
		const card = cardFor(page, trail);
		const badge = card.locator('.trail-card__badge');
		const icon = card.locator('.trail-card__badge-icon');
		const word = card.locator('.trail-card__badge-text');
		await expect(badge).toHaveText(STATUS_LABEL[trail.status]);
		await expect(icon).toBeVisible();
		expect((await word.boundingBox())!.width).toBe(0);

		await card.locator('.trail-card__summary').tap();
		await expect.poll(async () => (await word.boundingBox())!.width).toBeGreaterThan(0);
		await expect.poll(async () => (await icon.boundingBox())!.width).toBe(0);
		await expect(badge).toHaveText(STATUS_LABEL[trail.status]);
	});

	test('the forecast opens from the weather chip and fits the screen', async ({ page }) => {
		await openSite(page);
		const trail = fixture.trails.find((candidate) => candidate.weather)!;
		const card = cardFor(page, trail);
		await card.locator('.trail-card__summary').tap();
		await card.locator('.trail-card__weather').tap();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		const { date, history, periods } = trail.weather!;
		const currentHourRows = periods.some((period) => period.date === date && period.isDay) ? 0 : 1;
		await expect(dialog.locator('.forecast-row')).toHaveCount(history.length + periods.length + currentHourRows);
		const viewport = page.viewportSize()!;
		const panel = await dialog.locator('.forecast-dialog__panel').boundingBox();
		expect(panel!.width).toBeLessThanOrEqual(viewport.width);
		expect(panel!.x).toBeGreaterThanOrEqual(0);

		await dialog.getByRole('button', { name: 'Close' }).tap();
		await expect(dialog).toBeHidden();
	});

	test('the header keeps its toggles reachable next to the title', async ({ page }) => {
		await openSite(page);
		await expect(page.locator('.qr-button')).toBeVisible();
		await expect(page.locator('.theme-toggle')).toBeVisible();
		await expect(page.locator('h1')).toBeVisible();
	});
});

// The widest window that still gets the phone layout: room for two tiles
// abreast, which it must not take.
test.describe('phone layout in a wide window', () => {
	test.use({ viewport: { height: 900, width: 768 } });

	test('keeps the tiles in one column', async ({ page }) => {
		await openSite(page);
		const cards = page.locator('.trail-card');
		const boxes = await Promise.all((await cards.all()).map((card) => card.boundingBox()));
		const lefts = new Set(boxes.map((box) => box?.x));
		expect(lefts.size).toBe(1);
		await expect(cards.first().locator('.trail-card__details')).toBeHidden();
	});
});
