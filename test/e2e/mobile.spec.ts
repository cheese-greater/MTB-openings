import { devices, expect, test } from '@playwright/test';

import { cardFor, fixture, openSite } from './helpers';

const STATUS_LABEL: Record<string, string> = { caution: 'Caution', closed: 'Closed', open: 'Open', stale: 'Stale' };

// A device profile sets the browser type, which Playwright only allows at file level.
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
		await expect(dialog).toHaveClass(/forecast-dialog--closing/);
		await expect(dialog).toBeHidden();
	});

	test('back closes the forecast and stays on the page, and a closed dialog leaves the history as it found it', async ({
		page
	}) => {
		await openSite(page);
		const trail = fixture.trails.find((candidate) => candidate.weather)!;
		const card = cardFor(page, trail);
		// The entry the open dialog holds is tagged; the page's own entry is not.
		const historyState = () => page.evaluate(() => window.history.state as unknown);
		expect(await historyState()).toBeNull();
		await card.locator('.trail-card__summary').tap();
		await card.locator('.trail-card__weather').tap();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		expect(await historyState()).toEqual({ dialog: 'forecast' });

		await page.goBack();
		await expect(dialog).toBeHidden();
		await expect(page.locator('.trail-card')).toHaveCount(fixture.trails.length);
		expect(await historyState()).toBeNull();

		await card.locator('.trail-card__weather').tap();
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Close' }).tap();
		await expect(dialog).toBeHidden();
		await expect.poll(historyState).toBeNull();
	});

	test('a reload while the forecast is open drops its entry, so back leaves the page as before', async ({ page }) => {
		await openSite(page);
		const trail = fixture.trails.find((candidate) => candidate.weather)!;
		const card = cardFor(page, trail);
		const historyState = () => page.evaluate(() => window.history.state as unknown);
		await card.locator('.trail-card__summary').tap();
		await card.locator('.trail-card__weather').tap();
		await expect(page.getByRole('dialog')).toBeVisible();
		expect(await historyState()).toEqual({ dialog: 'forecast' });

		// Android reloads the installed app onto the dialog's entry; the page drops it at once.
		await page.reload();
		await expect(page.locator('.trail-card')).toHaveCount(fixture.trails.length);
		await expect.poll(historyState).toBeNull();
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});

	test('coming back to the page with the forecast open restores its entry, so back still closes it', async ({
		page
	}) => {
		await openSite(page);
		const trail = fixture.trails.find((candidate) => candidate.weather)!;
		const card = cardFor(page, trail);
		const historyState = () => page.evaluate(() => window.history.state as unknown);
		await card.locator('.trail-card__summary').tap();
		await card.locator('.trail-card__weather').tap();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		expect(await historyState()).toEqual({ dialog: 'forecast' });

		// Stand-in for a browser restoring the app without the dialog's entry.
		await page.evaluate(() => {
			window.history.replaceState(null, '');
			window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
		});
		await expect.poll(historyState).toEqual({ dialog: 'forecast' });
		await expect(dialog).toBeVisible();

		await page.goBack();
		await expect(dialog).toBeHidden();
		await expect(page.locator('.trail-card')).toHaveCount(fixture.trails.length);
	});

	test('the header keeps its toggles reachable next to the title', async ({ page }) => {
		await openSite(page);
		await expect(page.locator('.guide-button')).toBeVisible();
		await expect(page.locator('.qr-button')).toBeVisible();
		await expect(page.locator('.theme-toggle')).toBeVisible();
		await expect(page.locator('h1')).toBeVisible();
	});

	test('the guide opens from the header and fits the screen', async ({ page }) => {
		await openSite(page);
		await page.locator('.guide-button').tap();
		const dialog = page.getByRole('dialog', { name: 'How it works' });
		await expect(dialog).toBeVisible();
		const viewport = page.viewportSize()!;
		const panel = await dialog.locator('.guide-dialog__panel').boundingBox();
		expect(panel!.width).toBeLessThanOrEqual(viewport.width);
		expect(panel!.x).toBeGreaterThanOrEqual(0);
		// The tallest part scrolls within the panel rather than off the screen.
		expect(panel!.height).toBeLessThanOrEqual(viewport.height);
		await expect(dialog.locator('.guide-tile').last()).toBeAttached();

		await dialog.getByRole('button', { name: 'Close' }).tap();
		await expect(dialog).toBeHidden();
	});
});

// The widest window that still gets the phone layout.
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
