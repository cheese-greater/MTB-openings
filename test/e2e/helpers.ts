import { expect, type Page } from '@playwright/test';

import type { Trail } from '../../src/trailData';
import payload from '../fixtures/trails.json' with { type: 'json' };

export interface Payload {
	cachedAt: number;
	sources: Record<string, number>;
	trails: Trail[];
}

export const fixture = payload as Payload;

// What the card shows as its title, mirroring TrailCard.tsx.
export const displayName = (trail: Trail): string => trail.name.replace('Ohio & Erie Canal', 'OECR');

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
