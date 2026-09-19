import { expect, test } from '@playwright/test';

import { cardFor, displayName, fixture, openSite } from './helpers';

const STATUS_LABEL: Record<string, string> = { caution: 'Caution', closed: 'Closed', open: 'Open', stale: 'Stale' };

test.describe('trail cards', () => {
	test.beforeEach(async ({ page }) => {
		await openSite(page);
	});

	test('render every trail with its status, name, location and report', async ({ page }) => {
		for (const trail of fixture.trails) {
			const card = cardFor(page, trail);
			await expect(card.locator('.trail-card__title')).toHaveText(displayName(trail));
			await expect(card.locator('.trail-card__badge')).toHaveText(STATUS_LABEL[trail.status]);
			await expect(card).toHaveClass(new RegExp(`trail-card--${trail.stale ? 'stale' : trail.status}\\b`));
			await expect(card.locator('.trail-card__location-text')).toHaveText(trail.location.replace(/^\S+\s/, ''));
			await expect(card.locator('.trail-card__condition')).toContainText(trail.condition.slice(0, 40));
		}
	});

	test('summarise the live cards in the header', async ({ page }) => {
		const live = fixture.trails.filter((trail) => !trail.stale);
		const count = (status: string) => live.filter((trail) => trail.status === status).length;
		await expect(page.locator('.summary-chip--open')).toHaveText(`${count('open')} open`);
		await expect(page.locator('.summary-chip--closed')).toHaveText(`${count('closed')} closed`);
		await expect(page.locator('.summary-chip--caution')).toHaveText(`${count('caution')} caution`);
	});

	test('link each card to the one page its report came from', async ({ page }) => {
		for (const trail of fixture.trails) {
			const links = cardFor(page, trail).locator('.trail-card__source');
			await expect(links).toHaveCount(1);
			await expect(links).toHaveText(trail.source.name);
			await expect(links).toHaveAttribute('href', trail.source.url);
			await expect(links).toHaveAttribute('target', '_blank');
		}
	});

	test('show the trailhead weather as a link to its forecast, or nothing', async ({ page }) => {
		for (const trail of fixture.trails) {
			const chip = cardFor(page, trail).locator('.trail-card__weather');
			if (trail.weather) {
				await expect(chip).toHaveText(`${trail.weather.temperature}°F`);
				await expect(chip).toHaveAttribute('href', trail.weather.forecastUrl);
				await expect(chip).toHaveAttribute(
					'title',
					new RegExp(`^${trail.weather.description} at the trailhead`)
				);
				await expect(chip.locator('svg')).toBeVisible();
			} else {
				await expect(chip).toHaveCount(0);
			}
		}
	});

	test('links brighten on hover and never underline', async ({ page }) => {
		const trail = fixture.trails.find((candidate) => candidate.weather)!;
		const card = cardFor(page, trail);
		for (const link of [
			card.locator('.trail-card__location'),
			card.locator('.trail-card__weather'),
			card.locator('.trail-card__source')
		]) {
			await link.hover();
			await expect(link).toHaveCSS('opacity', '1');
			await expect(link).toHaveCSS('text-decoration-line', 'none');
		}
	});

	test('show an error message when the payload cannot be loaded', async ({ page }) => {
		await page.route('**/trails.json', (route) => route.fulfill({ status: 503 }));
		await page.goto('/');
		await expect(page.locator('.status-msg--error')).toContainText('Could not load trail conditions');
	});
});
