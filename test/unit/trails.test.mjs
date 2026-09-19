// The scraper's logic, run against saved pages and fixed clocks. Nothing here
// touches the network: the parsers get the fixtures in test/fixtures, and the
// merge gets hand-built cards. Importing lib/trails.mjs pins TZ to Eastern, so
// every Date below is read the way the scraper reads it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
	bskyTrailFromFeed,
	buildRaysTrail,
	formatBskyDate,
	inferStatus,
	mergeTrails,
	parseCambaHome,
	parseMetroparks,
	parseMetroparksDate,
	parseRelativeOrDate,
	parseTrailforksRegion,
	RAYS_SCHEDULE,
	TRAILFORKS_REGIONS,
	TRAILHEADS
} from '../../lib/trails.mjs';

const fixture = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('inferStatus', () => {
	const cases = [
		['Trails have reopened after the rain!', 'open'],
		['Reopening at noon', 'open'],
		['Hampton Hills opens tomorrow', 'open'],
		['Trails are open', 'open'],
		['Closing the trails for the weekend due to mud.', 'closed'],
		['Trails closed', 'closed'],
		['Closures on the red loop', 'closed'],
		['Gates close at dusk, trails open', 'open'],
		['closely monitored, open', 'open'],
		['Wet and sloppy, please wait', 'caution']
	];
	for (const [text, expected] of cases) {
		it(`reads "${text}" as ${expected}`, () => {
			assert.equal(inferStatus(text), expected);
		});
	}
});

describe('Eastern time handling', () => {
	it('reads a Metroparks stamp as Eastern daylight time', () => {
		assert.equal(new Date(parseMetroparksDate('09/18/2026 10:30 PM')).toISOString(), '2026-09-19T02:30:00.000Z');
	});

	it('reads a winter Metroparks stamp as Eastern standard time', () => {
		assert.equal(new Date(parseMetroparksDate('01/15/2026 09:00 AM')).toISOString(), '2026-01-15T14:00:00.000Z');
	});

	it('returns null for a stamp it cannot read', () => {
		assert.equal(parseMetroparksDate('yesterday'), null);
	});

	it('formats a Bluesky instant in Eastern', () => {
		assert.equal(formatBskyDate('2026-09-19T02:30:00Z'), 'Sep 18, 10:30 PM');
	});

	it('resolves a relative CAMBA time against the clock', () => {
		const parsed = parseRelativeOrDate('6 hours ago');
		assert.ok(Math.abs(Date.now() - 6 * HOUR - parsed) < 2000);
	});

	it('reads an absolute TrailForks date as Eastern midnight', () => {
		assert.equal(new Date(parseRelativeOrDate('Jul 12, 2024')).toISOString(), '2024-07-12T04:00:00.000Z');
	});

	it('returns null for text with no date in it', () => {
		assert.equal(parseRelativeOrDate('sometime'), null);
	});
});

describe('parseMetroparks', () => {
	const trails = parseMetroparks(fixture('metroparks-trail-status.html'));

	it('reads every row of the trail-status table', () => {
		assert.equal(trails.length, 7);
		assert.deepEqual(trails.map((trail) => trail.id).sort(), [
			'bedford-single',
			'oec-flow',
			'oec-primitive',
			'oec-pump',
			'royalview-red',
			'royalview-yellow',
			'west-creek'
		]);
	});

	it('carries status, notes, stamp and the Metroparks source on each card', () => {
		const westCreek = trails.find((trail) => trail.id === 'west-creek');
		assert.equal(westCreek.status, 'open');
		assert.match(westCreek.condition, /^West Creek is in good shape/);
		assert.equal(westCreek.updatedAt, 'Sep 19, 08:58 AM');
		assert.equal(westCreek.timestamp, parseMetroparksDate('09/19/2026 08:58 AM'));
		assert.equal(westCreek.source.name, 'Cleveland Metroparks');
		assert.equal(westCreek.location, '98Q4+68 Parma, Ohio');
	});

	it('fills in a note when a row has none', () => {
		const bedford = trails.find((trail) => trail.id === 'bedford-single');
		assert.equal(bedford.condition, 'No issues reported');
	});

	it('greys out a row whose status box it cannot read', () => {
		const html = `<table class="loc-status-table"><tbody><tr>
			<td class="loc-status-table-loc">Mystery Trail</td>
			<td><div class="loc-status-table-status-box loc-status-mystery"></div></td>
			<td class="loc-status-table-wrap"></td>
			<td>09/19/2026 08:00 AM</td>
		</tr></tbody></table>`;
		const [trail] = parseMetroparks(html);
		assert.equal(trail.status, 'stale');
		assert.equal(trail.id, 'mystery-trail');
		assert.match(trail.condition, /^No live data/);
	});
});

describe('parseCambaHome', () => {
	const entries = parseCambaHome(fixture('camba-home.html'));

	it('reads every alert block with its trail id', () => {
		assert.equal(entries.length, 21);
		assert.ok(entries.every((entry) => Number.isInteger(entry.p6Id) && entry.p6Id > 0));
	});

	it('takes the status from the alert colour and the words from the post', () => {
		const flowTrail = entries.find((entry) => entry.p6Id === 6);
		assert.equal(flowTrail.status, 'closed');
		assert.match(flowTrail.condition, /^Wet with some puddles/);
		assert.match(flowTrail.updatedAt, /ago$/);
		assert.equal(typeof flowTrail.timestamp, 'number');
	});

	it('throws on a page with no alerts, so the source counts as down', () => {
		assert.throws(
			() => parseCambaHome('<html><body><div id="TrailMate_alerts"></div></body></html>'),
			/no trail alerts/
		);
	});
});

describe('parseTrailforksRegion', () => {
	const region = TRAILFORKS_REGIONS[0];
	const regionPage = (iconClass) => `<div>
		<div class="grey">Region Status</div>
		<span class="sicon_small ${iconClass}" title="Trails are dry and fast"></span>
		<span class="clickable">as of Jul 12, 2024</span>
	</div>`;

	it('reads the icon colour as the status and the title as the condition', () => {
		const trail = parseTrailforksRegion(regionPage('sgreen'), region);
		assert.equal(trail.status, 'open');
		assert.equal(trail.condition, 'Trails are dry and fast');
		assert.equal(trail.updatedAt, 'Jul 12, 2024');
		assert.equal(trail.timestamp, parseRelativeOrDate('Jul 12, 2024'));
		assert.equal(trail.source, region.source);
	});

	it('maps the warning colours to caution and red to closed', () => {
		assert.equal(parseTrailforksRegion(regionPage('syellow'), region).status, 'caution');
		assert.equal(parseTrailforksRegion(regionPage('sred'), region).status, 'closed');
	});

	it('throws when the status block is missing, as on a challenge page', () => {
		assert.throws(
			() => parseTrailforksRegion('<html><body>Checking your browser</body></html>', region),
			/not found/
		);
	});
});

describe('bskyTrailFromFeed', () => {
	const feed = JSON.parse(fixture('bsky-author-feed.json'));
	const account = {
		handle: 'smpmountainbike.bsky.social',
		id: 'hampton-hills',
		location: '5C2X+FP Akron, Ohio',
		name: 'Hampton Hills',
		source: { name: 'Bluesky - @smpmountainbike', url: 'https://bsky.app/profile/smpmountainbike.bsky.social' }
	};

	it('skips reposts and links the card to the post it quotes', () => {
		const trail = bskyTrailFromFeed(feed, account);
		const firstOwnPost = feed.feed.find((entry) => !entry.reason).post;
		assert.equal(trail.condition, firstOwnPost.record.text);
		assert.equal(
			trail.source.url,
			`https://bsky.app/profile/${firstOwnPost.author.handle}/post/${firstOwnPost.uri.split('/').pop()}`
		);
		assert.equal(trail.source.name, account.source.name);
		assert.equal(trail.timestamp, Date.parse(firstOwnPost.indexedAt));
		assert.ok(['open', 'closed', 'caution'].includes(trail.status));
	});

	it('throws when the feed holds nothing but reposts', () => {
		const reposts = { feed: feed.feed.filter((entry) => entry.reason) };
		assert.ok(reposts.feed.length > 0, 'the fixture needs a repost entry');
		assert.throws(() => bskyTrailFromFeed(reposts, account), /No original posts/);
	});
});

describe("Ray's schedule", () => {
	// Dates come from the schedule itself so these keep passing when a new
	// season is transcribed.
	const minutesOf = (time) => {
		const [, hour, minute, period] = /(\d+):(\d+)\s*(AM|PM)/i.exec(time);
		return ((+hour % 12) + (/pm/i.test(period) ? 12 : 0)) * 60 + +minute;
	};
	const easternInstant = (ymd, minutes) =>
		new Date(
			`${ymd}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`
		);
	const dailyRange = RAYS_SCHEDULE.ranges.find((range) => range.daily && !RAYS_SCHEDULE.exceptions[range.from]);
	const [closedDate, closedException] = Object.entries(RAYS_SCHEDULE.exceptions).find(
		([, exception]) => exception.closed
	);

	it('is open between the published hours', () => {
		const trail = buildRaysTrail(easternInstant(dailyRange.from, minutesOf(dailyRange.daily.open) + 60));
		assert.equal(trail.status, 'open');
		assert.match(
			trail.condition,
			new RegExp(`^Open now until ${dailyRange.daily.close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
		);
		assert.equal(trail.source.name, "Ray's prices, hours, and directions");
	});

	it('is caution before opening time, with the hours to come', () => {
		const trail = buildRaysTrail(easternInstant(dailyRange.from, minutesOf(dailyRange.daily.open) - 60));
		assert.equal(trail.status, 'caution');
		assert.match(trail.condition, /^Opens today at/);
	});

	it('is closed after closing time and says when it next opens', () => {
		const trail = buildRaysTrail(easternInstant(dailyRange.from, minutesOf(dailyRange.daily.close) + 30));
		assert.equal(trail.status, 'closed');
		assert.match(trail.condition, /Next open (tomorrow|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) /);
	});

	it('honours a closed holiday over the season it sits in', () => {
		const trail = buildRaysTrail(easternInstant(closedDate, 15 * 60));
		assert.equal(trail.status, 'closed');
		assert.equal(trail.condition.startsWith(`Closed today (${closedException.label}).`), true);
	});

	it('stamps the card with the start of the Eastern day', () => {
		const instant = easternInstant(dailyRange.from, 15 * 60);
		const trail = buildRaysTrail(instant);
		assert.equal(trail.timestamp, instant.getTime() - 15 * 60 * 60000);
	});

	it('greys out a date no season covers', () => {
		const trail = buildRaysTrail(new Date('2000-01-01T12:00:00'));
		assert.equal(trail.status, 'stale');
		assert.equal(trail.timestamp, null);
	});
});

describe('mergeTrails', () => {
	const now = Date.parse('2026-09-19T16:00:00Z');
	const metroparksSource = { name: 'Cleveland Metroparks', url: 'https://example.test/metroparks' };
	const metroparksCard = (id, name, overrides = {}) => ({
		condition: 'No issues reported',
		id,
		location: 'Somewhere, Ohio',
		name,
		source: metroparksSource,
		status: 'open',
		timestamp: now - 4 * HOUR,
		updatedAt: 'Sep 19, 08:00 AM',
		...overrides
	});
	const cambaEntry = (p6Id, overrides = {}) => ({
		condition: 'Muddy after the storm',
		name: 'CAMBA name',
		p6Id,
		status: 'closed',
		timestamp: now - 4 * HOUR + 5 * 60000,
		updatedAt: '4 hours ago',
		...overrides
	});
	const empty = { bsky: [], cambaHome: [], metroparks: [], trailforks: [], weather: new Map() };
	const merge = (inputs) => mergeTrails({ ...empty, ...inputs }, now);
	const cardById = (result, id) => result.trails.find((trail) => trail.id === id);

	it('keeps a live Metroparks row even when the CAMBA copy looks newer', () => {
		const result = merge({
			cambaHome: [cambaEntry(6)],
			metroparks: [metroparksCard('oec-flow', 'Ohio & Erie Canal - Flow Trail')]
		});
		const card = cardById(result, 'oec-flow');
		assert.equal(card.status, 'open');
		assert.equal(card.condition, 'No issues reported');
		assert.equal(card.source, metroparksSource);
	});

	it('lets CAMBA stand in when the Metroparks row could not be read', () => {
		const result = merge({
			cambaHome: [cambaEntry(6)],
			metroparks: [
				metroparksCard('oec-flow', 'Ohio & Erie Canal - Flow Trail', { status: 'stale', timestamp: null })
			]
		});
		const card = cardById(result, 'oec-flow');
		assert.equal(card.status, 'closed');
		assert.equal(card.condition, 'Muddy after the storm');
		assert.equal(card.source.name, 'CAMBA Trailmate');
		assert.match(card.source.url, /p6_id=6$/);
	});

	it('lets a newer CAMBA post outrank a TrailForks reading', () => {
		const region = TRAILFORKS_REGIONS[0];
		const trailforksCard = {
			...metroparksCard(region.id, region.name),
			source: region.source,
			timestamp: now - 400 * DAY
		};
		const result = merge({ cambaHome: [cambaEntry(105)], trailforks: [trailforksCard] });
		assert.equal(cardById(result, region.id).source.name, 'CAMBA Trailmate');
	});

	it('keeps a TrailForks reading that is newer than the CAMBA post', () => {
		const region = TRAILFORKS_REGIONS[0];
		const trailforksCard = {
			...metroparksCard(region.id, region.name),
			source: region.source,
			timestamp: now - HOUR
		};
		const result = merge({ cambaHome: [cambaEntry(105)], trailforks: [trailforksCard] });
		assert.equal(cardById(result, region.id).source, region.source);
	});

	it('adds a stale placeholder for every known trail that produced nothing', () => {
		const result = merge({});
		assert.equal(result.trails.length, 23);
		const westCreek = cardById(result, 'west-creek');
		assert.equal(westCreek.status, 'stale');
		assert.equal(westCreek.stale, true);
		assert.equal(westCreek.source.name, 'Cleveland Metroparks');
		assert.deepEqual(result.sources, { bsky: 0, cambaHome: 0, metroparks: 0, trailforks: 0, weather: 0 });
	});

	it('splits a multi-lot trail into one card per lot', () => {
		const result = merge({ metroparks: [metroparksCard('bedford-single', 'Bedford - Single Track')] });
		assert.equal(cardById(result, 'bedford-single'), undefined);
		assert.equal(cardById(result, 'bedford-olander').status, 'open');
		assert.equal(cardById(result, 'bedford-farley').name, 'Bedford - Farley Lot');
		assert.notEqual(cardById(result, 'bedford-olander').location, cardById(result, 'bedford-farley').location);
	});

	it('builds cards for CAMBA-only trails and fills East Rim from CAMBA', () => {
		const result = merge({ cambaHome: [cambaEntry(117, { status: 'open' }), cambaEntry(103), cambaEntry(999)] });
		const bigCreek = cardById(result, 'big-creek');
		assert.equal(bigCreek.status, 'open');
		assert.match(bigCreek.source.url, /p6_id=117$/);
		const eastRim = cardById(result, 'cvnp-east-rim');
		assert.equal(eastRim.status, 'closed');
		assert.match(eastRim.source.url, /p6_id=103$/);
		assert.equal(result.trails.length, 23, 'an unknown CAMBA id adds nothing');
	});

	it('flags a reading older than a week as stale without losing its status', () => {
		const result = merge({
			metroparks: [
				metroparksCard('west-creek', 'West Creek - Mountain Bike Trails', { timestamp: now - 8 * DAY })
			]
		});
		const card = cardById(result, 'west-creek');
		assert.equal(card.status, 'open');
		assert.equal(card.stale, true);
	});

	it("attaches weather and the forecast link by trailhead, and none to Ray's", () => {
		const point = TRAILHEADS['west-creek'];
		const current = { code: 800, description: 'Clear sky', isDay: true, temperature: 68 };
		const weather = new Map([[`${point.latitude},${point.longitude}`, current]]);
		const result = merge({
			metroparks: [metroparksCard('west-creek', 'West Creek - Mountain Bike Trails')],
			weather
		});
		assert.deepEqual(cardById(result, 'west-creek').weather, { ...current, forecastUrl: point.forecastUrl });
		assert.equal(cardById(result, 'oec-flow').weather, null, 'a point with no reading gets none');
		assert.equal(cardById(result, 'rays-indoor').weather, null);
		assert.equal(result.sources.weather, 1);
	});

	it("includes Ray's card computed for the given clock", () => {
		const rays = cardById(merge({}), 'rays-indoor');
		assert.ok(rays);
		assert.equal(rays.source.name, "Ray's prices, hours, and directions");
		assert.equal(rays.updatedAt, 'Updated daily from the published schedule');
	});
});
