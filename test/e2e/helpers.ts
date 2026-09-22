import { expect, type Page } from '@playwright/test';

import type { ForecastPeriod, Trail } from '../../src/trailData';
import payload from '../fixtures/trails.json' with { type: 'json' };

export interface Payload {
	cachedAt: number;
	sources: Record<string, number>;
	trails: Trail[];
}

export const fixture = payload as Payload;

// What the card shows as its title, mirroring TrailCard.tsx.
export const displayName = (trail: Trail): string => trail.name.replace('Ohio & Erie Canal', 'OECR');

// How the forecast dialog labels a day and a period, mirroring ForecastDialog.tsx.
const atNoon = (date: string): Date => new Date(`${date}T12:00:00`);
export const weekdayOf = (date: string): string => atNoon(date).toLocaleDateString('en-US', { weekday: 'long' });
export const monthDayOf = (date: string): string =>
	atNoon(date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
// A period is Day or Night under its day's heading, unless a later period of
// the same day would read the same, when it keeps its NWS name.
export const rowLabels = (periods: ForecastPeriod[]): string[] =>
	periods.map((period, index) => {
		const half = (candidate: ForecastPeriod) => (candidate.isDay ? 'Day' : 'Night');
		const clash = periods
			.slice(index + 1)
			.some((later) => later.date === period.date && half(later) === half(period));
		return clash ? period.name : half(period);
	});

// The card for a trail, found through the details element that carries its id.
export const cardFor = (page: Page, trail: Trail) =>
	page.locator('.trail-card', { has: page.locator(`#trail-details-${trail.id}`) });

// Serve the fixture in place of trails.json so no test touches a live source,
// then wait for the cards to be on the page.
export async function openSite(page: Page, trails: Payload = fixture): Promise<void> {
	await page.route('**/trails.json', (route) => route.fulfill({ json: trails }));
	await page.goto('/');
	await expect(page.locator('.trail-card')).toHaveCount(trails.trails.length);
}
