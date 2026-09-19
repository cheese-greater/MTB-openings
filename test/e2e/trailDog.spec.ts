import { expect, type Page, test } from '@playwright/test';

import { openSite } from './helpers';

// Mirrors HEEL_DISTANCE in TrailDog.tsx.
const HEEL_DISTANCE = 44;

const dogState = (page: Page) =>
	page.evaluate(() => {
		const element = document.querySelector<HTMLElement>('.trail-dog')!;
		const rect = element.getBoundingClientRect();
		return {
			cx: rect.left + rect.width / 2,
			cy: rect.top + rect.height / 2,
			pose: element.dataset.pose,
			transform: element.style.transform
		};
	});

// Sweep the mouse in steps so the dog has frames to react to.
async function sweep(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 25) {
	let sawRun = false;
	for (let step = 1; step <= steps; step++) {
		await page.mouse.move(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
		await page.waitForTimeout(16);
		if ((await dogState(page)).pose === 'run') sawRun = true;
	}
	return sawRun;
}

test.describe('trail dog', () => {
	test('runs after the cursor, waits at heel, and faces its direction of travel', async ({ page }) => {
		await openSite(page);
		await expect(page.locator('.trail-dog')).toHaveCount(1);

		const target = { x: 700, y: 480 };
		expect(await sweep(page, { x: 100, y: 300 }, target)).toBe(true);
		await expect.poll(async () => (await dogState(page)).pose).toBe('idle');
		const arrived = await dogState(page);
		expect(Math.abs(Math.hypot(target.x - arrived.cx, target.y - arrived.cy) - HEEL_DISTANCE)).toBeLessThan(3);
		expect(arrived.transform).toContain('scaleX(1)');

		await sweep(page, target, { x: 200, y: 480 });
		await expect.poll(async () => (await dogState(page)).transform).toContain('scaleX(-1)');
	});

	test('never gets in the way of a click', async ({ page }) => {
		await openSite(page);
		await sweep(page, { x: 100, y: 300 }, { x: 600, y: 400 });
		await expect.poll(async () => (await dogState(page)).pose).toBe('idle');
		const dogUnderPoint = await page.evaluate(() => {
			const element = document.querySelector('.trail-dog')!;
			const rect = element.getBoundingClientRect();
			const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
			return hit !== null && element.contains(hit);
		});
		expect(dogUnderPoint).toBe(false);
	});

	test('can be switched off, stays off across a reload, and comes back', async ({ page }) => {
		await openSite(page);
		const toggle = page.locator('.dog-button');
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');

		await toggle.click();
		await expect(page.locator('.trail-dog')).toHaveCount(0);
		await page.reload();
		await expect(page.locator('.dog-button')).toHaveAttribute('aria-pressed', 'false');
		await expect(page.locator('.trail-dog')).toHaveCount(0);

		await page.locator('.dog-button').click();
		await expect(page.locator('.trail-dog')).toHaveCount(1);
	});
});

test.describe('trail dog under reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('stays away, toggle included', async ({ page }) => {
		await openSite(page);
		await expect(page.locator('.trail-dog')).toHaveCount(0);
		await expect(page.locator('.dog-button')).toHaveCount(0);
	});
});

test.describe('trail dog on a touch screen', () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { height: 844, width: 390 } });

	test('stays away, toggle included', async ({ page }) => {
		await openSite(page);
		await expect(page.locator('.trail-dog')).toHaveCount(0);
		await expect(page.locator('.dog-button')).toHaveCount(0);
	});
});
