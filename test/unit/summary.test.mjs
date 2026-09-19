// The change detection behind the hourly commit: what counts as a change in
// trail conditions and what is ignored as noise.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { conditionsChanged, summarizeTrails } from '../../lib/summary.mjs';

const card = (overrides = {}) => ({
	condition: 'Dry and fast',
	id: 'west-creek',
	location: 'Parma, Ohio',
	name: 'West Creek',
	source: { name: 'Cleveland Metroparks', url: 'https://example.test' },
	stale: false,
	status: 'open',
	timestamp: 1000,
	updatedAt: '2 hours ago',
	weather: { code: 800, temperature: 70 },
	...overrides
});
const other = card({ id: 'oec-flow', name: 'OECR - Flow Trail', status: 'closed' });

describe('conditionsChanged', () => {
	it('ignores the clock-driven fields and the weather', () => {
		const moved = card({ timestamp: 9999, updatedAt: '3 hours ago', weather: { code: 500, temperature: 55 } });
		assert.equal(conditionsChanged([card()], [moved]), false);
	});

	it('ignores the order of the cards', () => {
		assert.equal(conditionsChanged([card(), other], [other, card()]), false);
	});

	it('notices a status change', () => {
		assert.equal(conditionsChanged([card()], [card({ status: 'closed' })]), true);
	});

	it('notices a corrected link or name', () => {
		assert.equal(
			conditionsChanged([card()], [card({ source: { name: 'CAMBA Trailmate', url: 'https://example.test' } })]),
			true
		);
		assert.equal(conditionsChanged([card()], [card({ name: 'West Creek Reservation' })]), true);
	});

	it('treats a missing previous file as a change', () => {
		assert.equal(conditionsChanged(undefined, [card()]), true);
		assert.equal(summarizeTrails(undefined), null);
	});
});
