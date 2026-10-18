// Live sources and the merge that turns them into trail cards.
import * as cheerio from 'cheerio';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Every source publishes Eastern wall-clock times, so pin the process clock to Eastern.
process.env.TZ = 'America/New_York';

const execFileAsync = promisify(execFile);

// TrailForks sits behind Cloudflare, which 403s Node's fetch; curl gets through.
async function curlText(url) {
	const { stdout } = await execFileAsync(
		'curl',
		['-s', '-L', '--max-time', '10', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', url],
		{ maxBuffer: 16 * 1024 * 1024 }
	);
	if (!stdout) throw new Error('curl returned empty body');
	return stdout;
}

const METROPARKS_URL = 'https://www.clevelandmetroparks.com/parks/visit/activities/mountain-biking/trail-status';
const CAMBA_BASE_URL = 'https://dualrates.com/a/r/szz/camba';
const CAMBA_HOME_URL = `${CAMBA_BASE_URL}/home`;
const cambaTrailUrl = (p6Id) => `${CAMBA_BASE_URL}/trail?p6_id=${p6Id}`;
// Sources shared by many cards.
const METROPARKS_SOURCE = { name: 'Cleveland Metroparks', url: METROPARKS_URL };
const cambaSource = (p6Id) => ({ name: 'CAMBA Trailmate', url: cambaTrailUrl(p6Id) });
const BSKY_API = 'https://public.api.bsky.app/xrpc';
const bskyFeedUrl = (handle) =>
	`${BSKY_API}/app.bsky.feed.getAuthorFeed?actor=${handle}&limit=10&filter=posts_no_replies`;
// National Weather Service: no key, only a User-Agent.
const NWS_API = 'https://api.weather.gov';
const NWS_HEADERS = {
	Accept: 'application/geo+json',
	'User-Agent': '(MTB-openings, https://cheese-greater.github.io/MTB-openings/)'
};
const CACHE_TTL = 60 * 60 * 1000;
// How long to wait before retrying when every live source is down.
const RETRY_AFTER_FAILURE = 5 * 60 * 1000;
const STALE_AFTER = 7 * 24 * 60 * 60 * 1000; // a week
const NO_LIVE_DATA = 'No live data. Check the link below for current conditions.';

// What a Metroparks row shows when it carries no notes of its own.
const METROPARKS_CONDITION_FALLBACK = {
	closed: 'No additional notes',
	open: 'No issues reported',
	stale: NO_LIVE_DATA
};

// The Metroparks trail-status table, keyed by the name the table uses.
const TRAIL_META = {
	'Bedford - Single Track': { id: 'bedford-single', location: '9C5P+GH Walton Hills, Ohio' },
	'Ohio & Erie Canal - Flow Trail': { id: 'oec-flow', location: 'C8JQ+92 Cuyahoga Heights, Ohio' },
	'Ohio & Erie Canal - Primitive Loop & Canal Trail': {
		id: 'oec-primitive',
		location: 'C8JQ+92 Cuyahoga Heights, Ohio'
	},
	'Ohio & Erie Canal - Pump Track': { id: 'oec-pump', location: 'C8JQ+92 Cuyahoga Heights, Ohio' },
	'Royalview - Red Loop': { id: 'royalview-red', location: '8664+8H Strongsville, Ohio' },
	'Royalview - Yellow Loop': { id: 'royalview-yellow', location: '852W+87 Strongsville, Ohio' },
	'West Creek - Mountain Bike Trails': { id: 'west-creek', location: '98Q4+68 Parma, Ohio' }
};

// Trails with more than one trailhead lot: one card per lot.
const TRAILHEAD_SPLITS = {
	'bedford-single': [
		{ id: 'bedford-olander', location: '9C5P+GH Walton Hills, Ohio', name: 'Bedford - Olander Lot' },
		{ id: 'bedford-farley', location: '9CFM+2R Walton Hills, Ohio', name: 'Bedford - Farley Lot' }
	],
	'reagan-park': [
		{ id: 'reagan-loop', location: '5535+9W Medina, Ohio', name: 'Reagan Park - Reagan Loop' },
		{ id: 'reagan-river', location: '5549+56 Medina, Ohio', name: 'Reagan Park - River Trail' }
	]
};

// The live card links to the post itself; this profile link is for the fallback.
const BSKY_ACCOUNTS = [
	{
		handle: 'smpmountainbike.bsky.social',
		id: 'hampton-hills',
		location: '5C2X+FP Akron, Ohio',
		name: 'Hampton Hills',
		source: { name: 'Bluesky - @smpmountainbike', url: 'https://bsky.app/profile/smpmountainbike.bsky.social' }
	}
];

// Status comes from the CAMBA home page (p6_id 103); this is just the card around it.
const CVNP_EAST_RIM = {
	id: 'cvnp-east-rim',
	location: '7F4J+3C Peninsula, Ohio',
	name: 'CVNP East Rim',
	source: cambaSource(103)
};

// TrailForks "Region Status" regions.
const TRAILFORKS_REGIONS = [
	{
		id: 'austin-badger',
		location: '459P+6R Medina, Ohio',
		name: 'Austin Badger Park',
		source: { name: 'TrailForks', url: 'https://www.trailforks.com/region/austin-badger-park-17345/' }
	}
];

// CAMBA p6_id to the app trail id it refreshes; unmatched known ids are in CAMBA_NEW_TRAILS.
const CAMBA_TRAIL_IDS = {
	2: 'bedford-single',
	3: 'royalview-red',
	4: 'oec-primitive',
	5: 'west-creek',
	6: 'oec-flow',
	7: 'oec-pump',
	8: 'royalview-yellow',
	103: 'cvnp-east-rim',
	105: 'austin-badger',
	108: 'hampton-hills'
};

// Trails that only appear on the CAMBA home page.
const CAMBA_NEW_TRAILS = {
	106: { id: 'mohican', location: 'JP5R+6Q Loudonville, Ohio', name: 'Mohican' },
	107: { id: 'vulturesknob', location: 'V229+9R Wooster, Ohio', name: "Vulture's Knob" },
	109: { id: 'camp-tuscazoar', location: 'GJW2+G2 Dover, Ohio', name: 'Camp Tuscazoar' },
	110: { id: 'thorn-ftp', location: '4QQP+98 Wellington, Ohio', name: 'Thorn (FTP)' },
	// 111 (Ray's Indoor) runs on a published schedule; see RAYS_SCHEDULE.
	112: { id: 'lake-milton', location: '324M+H2 Lake Milton, Ohio', name: 'Lake Milton' },
	113: { id: 'huffman', location: 'RW44+2M Dayton, Ohio', name: 'Huffman' },
	114: { id: 'reagan-park', location: '5535+9W Medina, Ohio', name: 'Reagan Park' },
	115: { id: 'west-branch', location: '4VJ5+V4 Ravenna, Ohio', name: 'West Branch' },
	116: { id: 'quail-hollow', location: 'XMGQ+PR Hartville, Ohio', name: 'Quail Hollow' },
	117: { id: 'big-creek', location: 'JQ9V+89 Chardon, Ohio', name: 'Big Creek' }
};

// --- Ray's Indoor Mountain Bike Park: a published schedule, computed rather than scraped ---
const RAYS_META = {
	id: 'rays-indoor',
	location: 'F63X+V3 Cleveland, Ohio',
	name: "Ray's Indoor Mountain Bike Park",
	source: {
		name: "Ray's prices, hours, and directions",
		url: 'https://www.raysmtb.com/about/prices-hours-and-directions-pg141.htm'
	}
};

const RAYS_SCHEDULE = {
	// Single-day overrides win over ranges. `{ closed: true }` or open hours.
	exceptions: {
		'2026-11-26': { closed: true, label: 'Thanksgiving' },
		'2026-11-27': { open: '9:00 AM', close: '10:00 PM', label: 'Black Friday' },
		'2026-12-24': { open: '9:00 AM', close: '5:00 PM', label: 'Christmas Eve' },
		'2026-12-25': { closed: true, label: 'Christmas Day' },
		'2027-01-18': { open: '9:00 AM', close: '10:00 PM', label: 'MLK Day' },
		'2027-02-12': {
			open: '4:00 PM',
			close: '10:00 PM',
			label: "Women's Weekend",
			note: 'Private event 8:00 AM-4:00 PM; open to the public after 4:00 PM.'
		},
		'2027-02-15': { open: '9:00 AM', close: '10:00 PM', label: 'Presidents Day' },
		'2027-03-28': { closed: true, label: 'Easter' }
	},
	// Date ranges, first match wins; byDay keys are 0=Sun..6=Sat and a missing weekday is closed.
	ranges: [
		{
			from: '2026-12-21',
			to: '2027-01-01',
			label: 'Extended holiday hours',
			daily: { open: '9:00 AM', close: '10:00 PM' }
		},
		{
			from: '2026-10-02',
			to: '2027-05-02',
			label: 'Regular season',
			byDay: {
				0: { open: '9:00 AM', close: '10:00 PM' },
				1: { open: '12:00 PM', close: '10:00 PM' },
				2: { open: '12:00 PM', close: '10:00 PM' },
				3: { open: '12:00 PM', close: '10:00 PM' },
				4: { open: '12:00 PM', close: '10:00 PM' },
				5: { open: '12:00 PM', close: '10:00 PM' },
				6: { open: '9:00 AM', close: '10:00 PM' }
			}
		},
		{ from: '2026-09-06', to: '2026-10-01', label: 'Fall hours', daily: { open: '2:00 PM', close: '8:00 PM' } },
		{
			from: '2026-05-10',
			to: '2026-09-06',
			label: 'Summer Sessions',
			byDay: { 0: { open: '2:00 PM', close: '8:00 PM' } }
		}
	]
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Eastern date, minutes since midnight and weekday of an instant.
function easternParts(date) {
	const twoDigits = (value) => String(value).padStart(2, '0');
	return {
		ymd: `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`,
		minutes: date.getHours() * 60 + date.getMinutes(),
		weekday: date.getDay()
	};
}

// The Eastern calendar date one day after ymd, DST-safe.
function nextEasternDate(ymd) {
	const [year, month, day] = ymd.split('-').map(Number);
	const next = new Date(Date.UTC(year, month - 1, day + 1));
	return { weekday: next.getUTCDay(), ymd: next.toISOString().slice(0, 10) };
}

function timeToMinutes(time) {
	const match = /(\d+):(\d+)\s*(AM|PM)/i.exec(time ?? '');
	// A typo in RAYS_SCHEDULE surfaces as a readable message.
	if (!match) throw new Error(`Ray's schedule: cannot read the time ${JSON.stringify(time)}`);
	return ((+match[1] % 12) + (/pm/i.test(match[3]) ? 12 : 0)) * 60 + +match[2];
}

// Resolve a day to { state: 'open'|'closed'|'unknown', open?, close?, label?, note? }.
function raysDay(ymd, weekday) {
	const exc = RAYS_SCHEDULE.exceptions[ymd];
	if (exc) return exc.closed ? { state: 'closed', label: exc.label } : { state: 'open', ...exc };
	for (const r of RAYS_SCHEDULE.ranges) {
		if (ymd < r.from || ymd > r.to) continue;
		const h = r.daily ?? r.byDay?.[weekday];
		return h
			? { state: 'open', open: h.open, close: h.close, label: r.label }
			: { state: 'closed', label: r.label };
	}
	return { state: 'unknown' };
}

// Look ahead for the next day Ray's is open, for the "Next open ..." hint.
function raysNextOpen(todayYmd) {
	let date = { ymd: todayYmd };
	for (let daysAhead = 1; daysAhead <= 28; daysAhead++) {
		date = nextEasternDate(date.ymd);
		const day = raysDay(date.ymd, date.weekday);
		if (day.state === 'open') {
			const when = daysAhead === 1 ? 'tomorrow' : WEEKDAY_NAMES[date.weekday];
			return ` Next open ${when} ${day.open}-${day.close}.`;
		}
	}
	return '';
}

// Build Ray's card from the schedule for the given instant.
function buildRaysTrail(now = new Date()) {
	const { ymd, minutes, weekday } = easternParts(now);
	const today = raysDay(ymd, weekday);
	const tag = today.label ? ` - ${today.label}` : '';
	let status;
	let condition;

	if (today.state === 'unknown') {
		status = 'stale';
		condition =
			'Indoor park on a fixed seasonal schedule. The current season is not yet published here. See the link below for hours.';
	} else if (today.state === 'closed') {
		status = 'closed';
		condition = `Closed today${today.label ? ` (${today.label})` : ''}.${raysNextOpen(ymd)}`;
	} else {
		const open = timeToMinutes(today.open);
		const close = timeToMinutes(today.close);
		if (minutes < open) {
			status = 'caution';
			condition = `Opens today at ${today.open}. Today's hours ${today.open}-${today.close}${tag}.`;
		} else if (minutes >= close) {
			status = 'closed';
			condition = `Closed for the day (today was ${today.open}-${today.close}${tag}).${raysNextOpen(ymd)}`;
		} else {
			status = 'open';
			condition = `Open now until ${today.close}. Today's hours ${today.open}-${today.close}${tag}.`;
		}
		if (today.note) condition += ` ${today.note}`;
	}

	// Stamp with the start of today so the card sorts as refreshed daily; off-season stays unstamped.
	const timestamp = today.state === 'unknown' ? null : now.getTime() - minutes * 60000;
	return { ...RAYS_META, condition, status, timestamp, updatedAt: 'Updated daily from the published schedule' };
}

// Ray's is computed, not fetched, so a schedule typo degrades to a stale card instead of failing the payload.
function raysTrailOrFallback(now) {
	try {
		return buildRaysTrail(now);
	} catch (error) {
		console.error(`Ray's schedule could not be read: ${error.message}`);
		return { ...RAYS_META, condition: NO_LIVE_DATA, status: 'stale', timestamp: null, updatedAt: '-' };
	}
}

function formatUpdatedAt(raw) {
	const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d+:\d+) (AM|PM)/);
	if (!match) return raw;
	const [, month, day, , time, period] = match;
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	return `${months[+month - 1]} ${+day}, ${time} ${period}`;
}

// Parse a Metroparks update time into epoch ms (null if unknown), used only for staleness.
function parseMetroparksDate(raw) {
	const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d+):(\d+) (AM|PM)/);
	if (!match) return null;
	const [, month, day, year, hour, minute, period] = match;
	return new Date(+year, +month - 1, +day, (+hour % 12) + (period === 'PM' ? 12 : 0), +minute).getTime();
}

function parseRelativeOrDate(text) {
	const rel = text.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago/i);
	if (rel) {
		const unit = { minute: 60e3, hour: 3600e3, day: 86400e3, week: 604800e3, month: 2592e6, year: 31536e6 }[
			rel[2].toLowerCase()
		];
		return Date.now() - +rel[1] * unit;
	}
	const t = Date.parse(text);
	return Number.isNaN(t) ? null : t;
}

// Whole words only, so "gates close at dusk" is not Closed; closed still wins over open.
const CLOSED_WORDS = /\b(closed|closing|closures?)\b/;
const OPEN_WORDS = /\b(re)?open(s|ed|ing)?\b/;

function inferStatus(text) {
	const lower = text.toLowerCase();
	if (CLOSED_WORDS.test(lower)) return 'closed';
	if (OPEN_WORDS.test(lower)) return 'open';
	return 'caution';
}

function formatBskyDate(iso) {
	const d = new Date(iso);
	return (
		d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) +
		', ' +
		d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
	);
}

let cachedPayload = null;
let cacheExpiry = 0;

const SCRAPER_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; CLE-MTB-Status/1.0)' };

async function fetchText(url, label) {
	const res = await fetch(url, { headers: SCRAPER_HEADERS, signal: AbortSignal.timeout(10000) });
	if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
	return res.text();
}

// The Metroparks trail-status table; parsing is separate from fetching so tests can feed saved pages.
function parseMetroparks(html) {
	const $ = cheerio.load(html);
	const trails = [];

	$('.loc-status-table tbody tr').each((_, row) => {
		const $row = $(row);
		const name = $row.find('.loc-status-table-loc').text().trim();
		if (!name) return;

		// An unknown status class means the markup moved: gray out rather than publish as closed.
		const statusBox = $row.find('.loc-status-table-status-box');
		const status = statusBox.hasClass('loc-status-open')
			? 'open'
			: statusBox.hasClass('loc-status-closed')
				? 'closed'
				: 'stale';
		const notes = $row.find('.loc-status-table-wrap').text().trim();
		const rawDate = $row.find('td').eq(3).text().trim();
		const meta = TRAIL_META[name] ?? {
			id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
			location: 'Cleveland Metroparks'
		};

		trails.push({
			condition: notes || METROPARKS_CONDITION_FALLBACK[status],
			id: meta.id,
			location: meta.location,
			name,
			source: METROPARKS_SOURCE,
			status,
			timestamp: parseMetroparksDate(rawDate),
			updatedAt: formatUpdatedAt(rawDate)
		});
	});

	return trails;
}

const scrapeMetroparks = async () => parseMetroparks(await fetchText(METROPARKS_URL, 'Metroparks'));

function cambaHomeStatus(className, text) {
	if (className.includes('t-Alert--success')) return 'open';
	if (className.includes('t-Alert--danger')) return 'closed';
	if (className.includes('t-Alert--warning')) return 'caution';
	return inferStatus(text); // e.g. the "info" alert for a seasonal park
}

// The CAMBA Trailmate home page: one alert block per trail, keyed by p6_id.
function parseCambaHome(html) {
	const $ = cheerio.load(html);
	const entries = [];

	$('#TrailMate_alerts .t-Alert').each((_, el) => {
		const $el = $(el);
		const link = $el.find('.t-Alert-title a');
		const p6Id = Number(link.attr('href')?.match(/p6_id=(\d+)/)?.[1]);
		if (!p6Id) return;

		const condition = $el.find('.t-Alert-body').text().trim().replace(/\s+/g, ' ');
		const when = $el.find('.t-Alert-buttons').text().trim().replace(/\s+/g, ' ');

		entries.push({
			condition,
			name: link.text().trim(),
			p6Id,
			status: cambaHomeStatus($el.attr('class') ?? '', `${link.text()} ${condition}`),
			timestamp: when ? parseRelativeOrDate(when) : null,
			updatedAt: when || '-'
		});
	});

	if (entries.length === 0) throw new Error('CAMBA home: no trail alerts found');
	return entries;
}

const scrapeCambaHome = async () => parseCambaHome(await fetchText(CAMBA_HOME_URL, 'CAMBA home'));

function trailforksStatus(iconClass) {
	if (/\bsgreen\b/.test(iconClass)) return 'open';
	if (/\bsred\b/.test(iconClass)) return 'closed';
	if (/\bs(yellow|orange|blue)\b/.test(iconClass)) return 'caution';
	return 'stale';
}

// A TrailForks region page's "Region Status" block; throws when missing (a Cloudflare challenge looks the same).
function parseTrailforksRegion(html, region) {
	const $ = cheerio.load(html);
	const container = $('.grey')
		.filter((_, el) => $(el).text().trim() === 'Region Status')
		.first()
		.parent();
	const icon = container.find('.sicon_small').first();
	if (!icon.length) throw new Error('TrailForks: region status not found');

	// Trailing span reads e.g. "as of Jul 12, 2024".
	const asOf = container
		.find('.clickable')
		.first()
		.text()
		.trim()
		.replace(/^as of\s*/i, '');

	return {
		condition: icon.attr('title')?.trim() || 'See TrailForks for current conditions',
		id: region.id,
		location: region.location,
		name: region.name,
		source: region.source,
		status: trailforksStatus(icon.attr('class') ?? ''),
		timestamp: asOf ? parseRelativeOrDate(asOf) : null,
		updatedAt: asOf || '-'
	};
}

async function fetchTrailforksRegions() {
	return Promise.all(
		TRAILFORKS_REGIONS.map(async (region) => {
			try {
				return parseTrailforksRegion(await curlText(region.source.url), region);
			} catch {
				return {
					condition: NO_LIVE_DATA,
					id: region.id,
					location: region.location,
					name: region.name,
					source: region.source,
					status: 'stale',
					updatedAt: '-'
				};
			}
		})
	);
}

// The account's latest original post as a card; reposts and pins carry a reason and are skipped.
function bskyTrailFromFeed(data, account) {
	const post = data.feed?.find((entry) => !entry.reason)?.post;
	if (!post) throw new Error('No original posts found');

	const text = post.record?.text ?? '';
	const rkey = post.uri.split('/').pop();
	const postUrl = `https://bsky.app/profile/${post.author?.handle ?? account.handle}/post/${rkey}`;

	return {
		condition: text,
		id: account.id,
		location: account.location,
		name: account.name,
		// The post itself, not the profile: that is where this report came from.
		source: { name: account.source.name, url: postUrl },
		status: inferStatus(text),
		timestamp: Date.parse(post.indexedAt),
		updatedAt: formatBskyDate(post.indexedAt)
	};
}

async function fetchBskyTrails() {
	const results = await Promise.allSettled(
		BSKY_ACCOUNTS.map(async (account) => {
			const res = await fetch(bskyFeedUrl(account.handle), { signal: AbortSignal.timeout(10000) });
			if (!res.ok) throw new Error(`Bluesky HTTP ${res.status}`);
			return bskyTrailFromFeed(await res.json(), account);
		})
	);

	return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
}

// Every trail we render, with the metadata for its live card and its stale fallback.
const KNOWN_TRAILS = [
	...Object.entries(TRAIL_META).map(([name, meta]) => ({ ...meta, name, source: METROPARKS_SOURCE })),
	...BSKY_ACCOUNTS.map(({ id, location, name, source }) => ({ id, location, name, source })),
	CVNP_EAST_RIM,
	...TRAILFORKS_REGIONS,
	...Object.entries(CAMBA_NEW_TRAILS).map(([p6Id, meta]) => ({ ...meta, source: cambaSource(Number(p6Id)) }))
];

// Expand multi-trailhead trails into one card per lot.
const splitTrailheads = (trail) =>
	(TRAILHEAD_SPLITS[trail.id] ?? [trail]).map((head) =>
		head === trail ? trail : { ...trail, id: head.id, location: head.location, name: head.name }
	);

// One stale placeholder per known card, left unsplit so the CAMBA refresh can match parent ids.
const FALLBACK_CARDS = KNOWN_TRAILS.map((trail) => ({
	...trail,
	condition: NO_LIVE_DATA,
	status: 'stale',
	timestamp: null,
	updatedAt: '-'
}));

// --- Weather: the current hour and five-day NWS forecast at each trailhead ---
const nwsPointForecastPage = (latitude, longitude) =>
	`https://forecast.weather.gov/MapClick.php?lat=${latitude}&lon=${longitude}`;
const trailheadAt = (grid, latitude, longitude) => ({
	forecastUrl: nwsPointForecastPage(latitude, longitude),
	grid,
	latitude,
	longitude
});

// Trailhead coordinates and NWS grid cells, keyed by card id.
const TRAILHEADS = {
	'austin-badger': trailheadAt('CLE/81,47', 41.1181, -81.8129),
	'bedford-farley': trailheadAt('CLE/88,60', 41.3726, -81.5654),
	'bedford-olander': trailheadAt('CLE/88,59', 41.3588, -81.5636),
	'big-creek': trailheadAt('CLE/99,72', 41.6183, -81.2066),
	'camp-tuscazoar': trailheadAt('PBZ/29,66', 40.5463, -81.3999),
	'cvnp-east-rim': trailheadAt('CLE/90,55', 41.2552, -81.5189),
	'hampton-hills': trailheadAt('CLE/90,50', 41.1512, -81.5507),
	huffman: trailheadAt('ILN/48,71', 39.8051, -84.0933),
	'lake-milton': trailheadAt('CLE/110,48', 41.0564, -80.9674),
	mohican: trailheadAt('CLE/68,23', 40.6081, -82.2581),
	'oec-flow': trailheadAt('CLE/85,62', 41.4309, -81.6624),
	'oec-primitive': trailheadAt('CLE/85,62', 41.4309, -81.6624),
	'oec-pump': trailheadAt('CLE/85,62', 41.4309, -81.6624),
	'quail-hollow': trailheadAt('CLE/99,43', 40.9768, -81.3104),
	'rays-indoor': trailheadAt('CLE/82,63', 41.4547, -81.7523),
	'reagan-loop': trailheadAt('CLE/80,49', 41.1534, -81.8402),
	'reagan-river': trailheadAt('CLE/80,49', 41.1554, -81.8319),
	'royalview-red': trailheadAt('CLE/81,56', 41.3108, -81.7936),
	'royalview-yellow': trailheadAt('CLE/80,56', 41.3008, -81.8043),
	'thorn-ftp': trailheadAt('CLE/67,47', 41.1384, -82.2142),
	vulturesknob: trailheadAt('CLE/76,35', 40.8509, -81.9804),
	'west-branch': trailheadAt('CLE/104,50', 41.1322, -81.1422),
	'west-creek': trailheadAt('CLE/84,60', 41.3881, -81.6942)
};

for (const trail of KNOWN_TRAILS.flatMap(splitTrailheads)) {
	if (!TRAILHEADS[trail.id]) {
		console.warn(`No trailhead entry for ${trail.id}, so its card will carry no weather.`);
	}
}

// One forecast per grid cell.
const weatherKey = (point) => point.grid;
const WEATHER_CELLS = [...new Set(Object.values(TRAILHEADS).map(weatherKey))];

const nwsForecastUrl = (grid) => `${NWS_API}/gridpoints/${grid}/forecast`;
const nwsHourlyForecastUrl = (grid) => `${NWS_API}/gridpoints/${grid}/forecast/hourly`;

async function fetchNws(url) {
	const res = await fetch(url, { headers: NWS_HEADERS, signal: AbortSignal.timeout(10000) });
	if (!res.ok) throw new Error(`weather.gov HTTP ${res.status}`);
	return res.json();
}

// The NWS condition name, read off the icon URL (first condition of a split period, wind_ prefix dropped).
const conditionFromIcon = (icon) => {
	const match = /\/icons\/land\/(?:day|night)\/(?:wind_)?([a-z_]+)/.exec(icon ?? '');
	return match ? match[1] : null;
};

// Fallback should the deprecated icon URLs go: the first matching pattern wins.
const CONDITION_FROM_TEXT = [
	[/thunder/i, 'tsra'],
	[/snow|flurries|blizzard/i, 'snow'],
	[/sleet|freezing|wintry/i, 'sleet'],
	[/rain|shower|drizzle/i, 'rain'],
	[/fog|haze|smoke|mist/i, 'fog'],
	[/partly/i, 'sct'],
	[/cloud|overcast/i, 'bkn'],
	[/sunny|clear/i, 'skc']
];
const conditionFromText = (text) => CONDITION_FROM_TEXT.find(([pattern]) => pattern.test(text ?? ''))?.[1] ?? 'bkn';

const DAY_MS = 24 * 60 * 60 * 1000;
const FORECAST_DAYS = 5;
// The Eastern calendar date as a day count, so two dates subtract to the days between.
const dayNumber = (date) => Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / DAY_MS);
// The same date as YYYY-MM-DD.
const localDate = (date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// What the card and dialog show of a period; a period already under way files under today.
const conditionsOf = (period, now) => ({
	condition: conditionFromIcon(period.icon) ?? conditionFromText(period.shortForecast),
	date: localDate(new Date(Math.max(Date.parse(period.startTime), now))),
	description: period.shortForecast,
	isDay: period.isDaytime,
	precipitationChance: period.probabilityOfPrecipitation?.value ?? 0,
	temperature: period.temperature
});

// The periods still to come, through the fifth day counting today.
const withinForecastDays = (periods, now) => {
	const today = dayNumber(new Date(now));
	return periods.filter(
		(period) => Date.parse(period.endTime) > now && dayNumber(new Date(period.startTime)) - today < FORECAST_DAYS
	);
};

// The hourly period for now, plus the day and night periods through the fifth day.
function parseForecast(hourly, daily, now) {
	const hours = hourly.properties?.periods ?? [];
	const current = hours.find((period) => Date.parse(period.endTime) > now) ?? hours[0];
	if (typeof current?.temperature !== 'number') throw new Error('weather.gov: no temperature in the hourly forecast');
	const periods = withinForecastDays(daily.properties?.periods ?? [], now);
	if (periods.length === 0) throw new Error('weather.gov: no forecast periods for the coming days');
	return {
		...conditionsOf(current, now),
		periods: periods.map((period) => ({ ...conditionsOf(period, now), name: period.name }))
	};
}

async function fetchCellWeather(grid, now) {
	const [hourly, daily] = await Promise.all([fetchNws(nwsHourlyForecastUrl(grid)), fetchNws(nwsForecastUrl(grid))]);
	return parseForecast(hourly, daily, now);
}

// Weather per grid cell; a failed cell is left out, and the source is down only when every cell failed.
async function fetchWeather() {
	const now = Date.now();
	const results = await Promise.allSettled(WEATHER_CELLS.map((grid) => fetchCellWeather(grid, now)));
	const byKey = new Map();
	results.forEach((result, index) => {
		if (result.status === 'fulfilled') byKey.set(WEATHER_CELLS[index], result.value);
	});
	if (byKey.size === 0) throw results[0].reason;
	return byKey;
}

// --- Past days: the three days before today at each trailhead, from Open-Meteo ---
const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';
const HISTORY_DAYS = 3;

// Keyed by point, since Open-Meteo works by coordinates.
const pointKey = (point) => `${point.latitude},${point.longitude}`;
const HISTORY_POINTS = [...new Map(Object.values(TRAILHEADS).map((point) => [pointKey(point), point])).values()];

// forecast_days cannot be 0, so today comes along and parseHistory drops it.
const openMeteoHistoryUrl = (points) =>
	`${OPEN_METEO_API}?${new URLSearchParams({
		daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
		forecast_days: 1,
		latitude: points.map((point) => point.latitude).join(','),
		longitude: points.map((point) => point.longitude).join(','),
		past_days: HISTORY_DAYS,
		precipitation_unit: 'inch',
		temperature_unit: 'fahrenheit',
		timezone: 'America/New_York'
	})}`;

// WMO weather codes mapped to NWS condition names and the dialog's words.
const WMO_CONDITIONS = {
	0: ['skc', 'Clear'],
	1: ['few', 'Mostly clear'],
	2: ['sct', 'Partly cloudy'],
	3: ['ovc', 'Overcast'],
	45: ['fog', 'Fog'],
	48: ['fog', 'Freezing fog'],
	51: ['rain', 'Light drizzle'],
	53: ['rain', 'Drizzle'],
	55: ['rain', 'Heavy drizzle'],
	56: ['fzra', 'Freezing drizzle'],
	57: ['fzra', 'Heavy freezing drizzle'],
	61: ['rain', 'Light rain'],
	63: ['rain', 'Rain'],
	65: ['rain', 'Heavy rain'],
	66: ['fzra', 'Freezing rain'],
	67: ['fzra', 'Heavy freezing rain'],
	71: ['snow', 'Light snow'],
	73: ['snow', 'Snow'],
	75: ['snow', 'Heavy snow'],
	77: ['snow', 'Snow grains'],
	80: ['rain_showers', 'Light showers'],
	81: ['rain_showers', 'Showers'],
	82: ['rain_showers', 'Heavy showers'],
	85: ['snow', 'Snow showers'],
	86: ['snow', 'Heavy snow showers'],
	95: ['tsra', 'Thunderstorms'],
	96: ['tsra', 'Thunderstorms with hail'],
	99: ['tsra', 'Thunderstorms with heavy hail']
};

const roundedNumber = (value, decimals = 0) =>
	typeof value === 'number' ? Math.round(value * 10 ** decimals) / 10 ** decimals : null;

// One location's past days, oldest first; today and any day with a missing reading are dropped.
function parseHistory(location, now) {
	const daily = location.daily ?? {};
	const today = localDate(new Date(now));
	return (daily.time ?? [])
		.map((date, index) => {
			const [condition, description] = WMO_CONDITIONS[daily.weather_code?.[index]] ?? [];
			return {
				condition,
				date,
				description,
				high: roundedNumber(daily.temperature_2m_max?.[index]),
				low: roundedNumber(daily.temperature_2m_min?.[index]),
				precipitation: roundedNumber(daily.precipitation_sum?.[index], 2)
			};
		})
		.filter(
			(day) =>
				day.date < today && day.condition && day.high !== null && day.low !== null && day.precipitation !== null
		);
}

// Past days for every point from one request; Open-Meteo returns an object for one location, an array for several.
async function fetchHistory() {
	const res = await fetch(openMeteoHistoryUrl(HISTORY_POINTS), { signal: AbortSignal.timeout(10000) });
	if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
	const locations = [].concat(await res.json());
	if (locations.length !== HISTORY_POINTS.length) {
		throw new Error(
			`Open-Meteo: ${locations.length} locations in the response for ${HISTORY_POINTS.length} points`
		);
	}
	const now = Date.now();
	const byKey = new Map();
	locations.forEach((location, index) => {
		const days = parseHistory(location, now);
		if (days.length > 0) byKey.set(pointKey(HISTORY_POINTS[index]), days);
	});
	if (byKey.size === 0) throw new Error('Open-Meteo: no past days in the response');
	return byKey;
}

// The card's weather object; null without a trailhead entry or a forecast.
const weatherFor = (trailId, weather, history) => {
	const trailhead = TRAILHEADS[trailId];
	const forecast = trailhead && weather.get(weatherKey(trailhead));
	if (!forecast) return null;
	return { ...forecast, forecastUrl: trailhead.forecastUrl, history: history.get(pointKey(trailhead)) ?? [] };
};

// How many of a source's cards carry a real reading.
const liveCount = (trails) => trails.filter((trail) => trail.status !== 'stale').length;

let inFlightScrape = null;

export async function getTrailsPayload() {
	if (cachedPayload && Date.now() < cacheExpiry) {
		return cachedPayload;
	}
	// One scrape at a time.
	inFlightScrape ??= scrapeEverySource().finally(() => {
		inFlightScrape = null;
	});
	return inFlightScrape;
}

// Whether every status source came back empty; TrailForks does not count.
const everyStatusSourceDown = ({ bsky, cambaHome, metroparks }) =>
	liveCount(metroparks) === 0 && liveCount(bsky) === 0 && liveCount(cambaHome) === 0;

async function scrapeEverySource() {
	const [metroparksResult, bskyResult, trailforksResult, cambaHomeResult, weatherResult, historyResult] =
		await Promise.allSettled([
			scrapeMetroparks(),
			fetchBskyTrails(),
			fetchTrailforksRegions(),
			scrapeCambaHome(),
			fetchWeather(),
			fetchHistory()
		]);
	const fetched = {
		bsky: bskyResult.status === 'fulfilled' ? bskyResult.value : [],
		cambaHome: cambaHomeResult.status === 'fulfilled' ? cambaHomeResult.value : [],
		history: historyResult.status === 'fulfilled' ? historyResult.value : new Map(),
		metroparks: metroparksResult.status === 'fulfilled' ? metroparksResult.value : [],
		trailforks: trailforksResult.status === 'fulfilled' ? trailforksResult.value : [],
		weather: weatherResult.status === 'fulfilled' ? weatherResult.value : new Map()
	};

	// Serve the last good payload when every live source failed.
	const allDown = everyStatusSourceDown(fetched);
	if (allDown && cachedPayload) {
		cacheExpiry = Date.now() + RETRY_AFTER_FAILURE;
		return cachedPayload;
	}

	const now = Date.now();
	cachedPayload = { cachedAt: now, ...mergeTrails(fetched, now) };
	// Retry a page of placeholders sooner than the full hour.
	cacheExpiry = now + (allDown ? RETRY_AFTER_FAILURE : CACHE_TTL);
	return cachedPayload;
}

// The merge: fetched cards with CAMBA applied, stale placeholders, lots split, weather attached.
function mergeTrails({ bsky, cambaHome, history, metroparks, trailforks, weather }, now) {
	// Index CAMBA entries: matched ones refresh a tracked trail, known unmatched ones become new cards.
	const cambaById = new Map();
	const cambaNew = [];
	for (const entry of cambaHome) {
		const existingId = CAMBA_TRAIL_IDS[entry.p6Id];
		if (existingId) {
			cambaById.set(existingId, entry);
		} else if (CAMBA_NEW_TRAILS[entry.p6Id]) {
			const meta = CAMBA_NEW_TRAILS[entry.p6Id];
			cambaNew.push({
				condition: entry.condition || 'See CAMBA Trailmate for current conditions.',
				id: meta.id,
				location: meta.location,
				name: meta.name,
				source: cambaSource(entry.p6Id),
				status: entry.status,
				timestamp: entry.timestamp,
				updatedAt: entry.updatedAt
			});
		}
	}

	// The report now comes from CAMBA, so the card's link follows it there.
	const takeCambaEntry = (trail, entry) => ({
		...trail,
		condition: entry.condition || trail.condition,
		source: cambaSource(entry.p6Id),
		status: entry.status,
		timestamp: entry.timestamp,
		updatedAt: entry.updatedAt
	});
	const primaryIsDown = (trail) => trail.timestamp == null || trail.status === 'stale';

	// CAMBA mirrors the primary source, so it stands in only when that source produced nothing readable.
	const fillFromCamba = (trail) => {
		const entry = cambaById.get(trail.id);
		return entry && primaryIsDown(trail) ? takeCambaEntry(trail, entry) : trail;
	};

	// For a trail whose primary source is sparse: a newer CAMBA post takes over.
	const refreshWithCamba = (trail) => {
		const entry = cambaById.get(trail.id);
		if (!entry) return trail;
		const newer = entry.timestamp != null && trail.timestamp != null && entry.timestamp > trail.timestamp;
		return primaryIsDown(trail) || newer ? takeCambaEntry(trail, entry) : trail;
	};

	// status stays the last-known condition with staleness flagged separately; ordering is the frontend's job.
	const live = [...metroparks.map(fillFromCamba), ...bsky.map(fillFromCamba), ...trailforks.map(refreshWithCamba)]
		.concat(cambaNew, raysTrailOrFallback(new Date(now)))
		.flatMap(splitTrailheads);

	// A stale fallback for every known trail with no live data, with CAMBA filling these in too.
	const liveIds = new Set(live.map((trail) => trail.id));
	const missing = FALLBACK_CARDS.map(fillFromCamba)
		.flatMap(splitTrailheads)
		.filter((trail) => !liveIds.has(trail.id));

	const trails = live.concat(missing).map((trail) => {
		const timestamp = trail.timestamp ?? null;
		const stale = trail.status === 'stale' || (timestamp != null && now - timestamp > STALE_AFTER);
		return { ...trail, stale, timestamp, weather: weatherFor(trail.id, weather, history) };
	});

	// Cards per source, so build-data.mjs can tell a real scrape from placeholders.
	const sources = {
		bsky: liveCount(bsky),
		cambaHome: liveCount(cambaHome),
		history: history.size,
		metroparks: liveCount(metroparks),
		trailforks: liveCount(trailforks),
		weather: weather.size
	};

	return { sources, trails };
}

// Exported for scripts/probe-sources.mjs and test/unit.
export {
	BSKY_ACCOUNTS,
	bskyFeedUrl,
	bskyTrailFromFeed,
	buildRaysTrail,
	CAMBA_HOME_URL,
	formatBskyDate,
	HISTORY_POINTS,
	inferStatus,
	mergeTrails,
	METROPARKS_URL,
	nwsForecastUrl,
	nwsHourlyForecastUrl,
	openMeteoHistoryUrl,
	parseCambaHome,
	parseForecast,
	parseHistory,
	parseMetroparks,
	parseMetroparksDate,
	parseRelativeOrDate,
	parseTrailforksRegion,
	RAYS_SCHEDULE,
	TRAILFORKS_REGIONS,
	TRAILHEADS,
	WEATHER_CELLS
};
