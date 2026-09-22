import { expect, test } from '@playwright/test';

import { cardFor, displayName, fixture, monthDayOf, openSite, rowLabels, weekdayOf } from './helpers';

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

	test('summarize the live cards in the header', async ({ page }) => {
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

	test('show the trailhead weather as a button, or nothing', async ({ page }) => {
		for (const trail of fixture.trails) {
			const chip = cardFor(page, trail).locator('.trail-card__weather');
			if (trail.weather) {
				await expect(chip).toHaveText(`${trail.weather.temperature}°F`);
				await expect(chip).toHaveAttribute('aria-haspopup', 'dialog');
				await expect(chip).toHaveAttribute('title', trail.weather.description);
				await expect(chip.locator('svg')).toBeVisible();
			} else {
				await expect(chip).toHaveCount(0);
			}
		}
	});

	test('open the forecast from the weather chip, grouped by day', async ({ page }) => {
		const trail = fixture.trails.find((candidate) => candidate.weather)!;
		const weather = trail.weather!;
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeHidden();

		await cardFor(page, trail).locator('.trail-card__weather').click();
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(displayName(trail));

		// One group per calendar day: the three past days, dimmed, then today
		// and the days ahead, each headed by its weekday and date.
		const forecastDates = [...new Set([weather.date, ...weather.periods.map((period) => period.date)])];
		const days = dialog.locator('.forecast-day');
		await expect(days).toHaveCount(weather.history.length + forecastDates.length);
		expect(weather.history.length).toBe(3);
		for (const [index, day] of weather.history.entries()) {
			const group = days.nth(index);
			await expect(group).toHaveClass(/forecast-day--past/);
			await expect(group).toHaveCSS('opacity', '0.5');
			await expect(group.locator('.forecast-day__weekday')).toHaveText(weekdayOf(day.date));
			await expect(group.locator('.forecast-day__date')).toHaveText(monthDayOf(day.date));
			const row = group.locator('.forecast-row');
			await expect(row).toHaveCount(1);
			await expect(row.locator('.forecast-row__label')).toHaveText(day.description);
			await expect(row.locator('.forecast-row__temp')).toHaveText(`${day.high}°/${day.low}°`);
			await expect(row.locator('.forecast-row__high')).toHaveText(`${day.high}°`);
			await expect(row.locator('.forecast-row__low')).toHaveText(`${day.low}°`);
			await expect(row.locator('.forecast-row__precip')).toHaveText(`${day.precipitation.toFixed(2)} in`);
		}
		for (const [index, date] of forecastDates.entries()) {
			const group = days.nth(weather.history.length + index);
			await expect(group).not.toHaveClass(/forecast-day--past/);
			await expect(group.locator('.forecast-day__weekday')).toHaveText(weekdayOf(date));
			await expect(group.locator('.forecast-day__date')).toHaveText(monthDayOf(date));
		}
		await expect(dialog.locator('.forecast-day__today')).toHaveCount(1);
		await expect(days.nth(weather.history.length).locator('.forecast-day__today')).toHaveText('Today');

		// Today reads Day and Night like any other day. Its Day row is the NWS
		// daytime period while one is still to come; once the day is over, the
		// current hour stands in for it. Then every period follows in order.
		const labels = rowLabels(weather.periods);
		const dayStillAhead = weather.periods.some((period) => period.date === weather.date && period.isDay);
		const expectedRows = [
			...(dayStillAhead ? [] : [{ ...weather, label: 'Day' }]),
			...weather.periods.map((period, index) => ({ ...period, label: labels[index] }))
		];
		expect(expectedRows[0].label).toBe('Day');
		const rows = dialog.locator('.forecast-day:not(.forecast-day--past) .forecast-row');
		await expect(rows).toHaveCount(expectedRows.length);
		await expect(dialog.locator('.forecast-row__label', { hasText: /^Now$/ })).toHaveCount(0);
		for (const [index, expected] of expectedRows.entries()) {
			const row = rows.nth(index);
			await expect(row.locator('.forecast-row__label')).toHaveText(expected.label);
			await expect(row.locator('.forecast-row__description')).toHaveText(expected.description);
			await expect(row.locator('.forecast-row__temp')).toHaveText(`${expected.temperature}°`);
			await expect(row.locator('.forecast-row__temp')).toHaveClass(
				new RegExp(`forecast-row__temp--${expected.label === 'Day' ? 'high' : 'low'}\\b`)
			);
			await expect(row.locator('.forecast-row__precip')).toHaveText(`${expected.precipitationChance}%`);
			await expect(row.locator('svg').first()).toBeVisible();
		}

		// The title and the close button stay put while the days scroll beneath.
		const panel = dialog.locator('.forecast-dialog__panel');
		await panel.evaluate((element) => element.scrollTo(0, element.scrollHeight));
		await expect(dialog.getByRole('heading', { level: 2 })).toBeInViewport();
		await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport();
		await expect(dialog.locator('.forecast-dialog__credit')).toBeInViewport();

		// The source line is also the way out to the full forecast.
		const credit = dialog.locator('.forecast-dialog__credit');
		await expect(credit).toContainText('Forecast from the National Weather Service.');
		await expect(credit).toContainText('Open-Meteo');
		const link = credit.getByRole('link', { name: 'National Weather Service' });
		await expect(link).toHaveAttribute('href', weather.forecastUrl);
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(dialog.locator('.forecast-dialog__link')).toHaveCount(0);

		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();

		await cardFor(page, trail).locator('.trail-card__weather').click();
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(dialog).toBeHidden();
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
