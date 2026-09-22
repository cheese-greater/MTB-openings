// Every live source, and the merge that turns them into trail cards.
//
// Two callers share it, which is why it lives here rather than in server.mjs:
// server.mjs scrapes at request time for a self-hosted copy, and
// scripts/build-data.mjs writes the same payload to public/trails.json for the
// static build GitHub Pages publishes. One function, so both return the same
// shape and the frontend cannot tell which one served it.
import * as cheerio from 'cheerio';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Every source publishes Eastern wall-clock times and every reader is in
// Northeast Ohio, so this process keeps its clock in Eastern too. Without it a
// UTC host, which is what the Actions runner that publishes the site is, read a
// Metroparks "10:30 PM" as 22:30 UTC and printed a Bluesky post's time four
// hours off. Node applies a change to TZ immediately, so every Date parse and
// format below is Eastern without each site having to say so.
process.env.TZ = 'America/New_York';

const execFileAsync = promisify(execFile);

// TrailForks sits behind Cloudflare, which 403s Node's fetch on TLS fingerprint.
// curl uses a different TLS stack and gets through, so shell out to it.
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
// Each card links to the one page its report was pulled from. These are the two
// sources shared by many cards; Bluesky, TrailForks and Ray's set theirs inline.
const METROPARKS_SOURCE = { name: 'Cleveland Metroparks', url: METROPARKS_URL };
const cambaSource = (p6Id) => ({ name: 'CAMBA Trailmate', url: cambaTrailUrl(p6Id) });
const BSKY_API = 'https://public.api.bsky.app/xrpc';
const bskyFeedUrl = (handle) =>
	`${BSKY_API}/app.bsky.feed.getAuthorFeed?actor=${handle}&limit=10&filter=posts_no_replies`;
// Weather at each trailhead, from the National Weather Service. Its API asks
// for no key, only a User-Agent that says who is calling and how to reach them.
const NWS_API = 'https://api.weather.gov';
const NWS_HEADERS = {
	Accept: 'application/geo+json',
	'User-Agent': '(MTB-openings, https://cheese-greater.github.io/MTB-openings/)'
};
const CACHE_TTL = 60 * 60 * 1000;
// How long to wait before trying again when every live source is down, whether
// that means sitting on the last good payload or on a page of placeholders.
// Short enough that a brief outage clears quickly, long enough that it does not
// turn into a re-scrape of every upstream on every request.
const RETRY_AFTER_FAILURE = 5 * 60 * 1000;
const STALE_AFTER = 7 * 24 * 60 * 60 * 1000; // a week
const NO_LIVE_DATA = 'No live data. Check the link below for current conditions.';

// What a Metroparks row shows when it carries no notes of its own.
const METROPARKS_CONDITION_FALLBACK = {
	closed: 'No additional notes',
	open: 'No issues reported',
	stale: NO_LIVE_DATA
};

// The Metroparks trail-status table, keyed by the name the table uses. Their
// source is always METROPARKS_SOURCE, so it is not repeated here.
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

// Some trails have more than one trailhead lot. When a trail id appears here it
// is rendered as one card per lot, each sharing the trail's scraped status,
// condition, and timestamp but with its own name and Maps location.
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

// Status, condition and timestamp come from the CAMBA home page like every other
// CAMBA trail (p6_id 103 in CAMBA_TRAIL_IDS below); this is just the card around
// them. It used to have its own scraper pointed at camba.dualrates.com, but that
// host 302s every trail page to the home page, so the scrape parsed nothing and
// the home-page entry was quietly doing the work anyway.
const CVNP_EAST_RIM = {
	id: 'cvnp-east-rim',
	location: '7F4J+3C Peninsula, Ohio',
	name: 'CVNP East Rim',
	source: cambaSource(103)
};

// Scraped from TrailForks region "Region Status" (community-reported conditions).
// The source page is the one scraped.
const TRAILFORKS_REGIONS = [
	{
		id: 'austin-badger',
		location: '459P+6R Medina, Ohio',
		name: 'Austin Badger Park',
		source: { name: 'TrailForks', url: 'https://www.trailforks.com/region/austin-badger-park-17345/' }
	}
];

// The CAMBA Trailmate home page lists every CAMBA-tracked trail in a single
// fetch (community-reported conditions, same platform as CVNP East Rim). For
// the Metroparks and Bluesky trails it is a mirror of the primary source, same
// status and same words, so it only stands in when that source is down. For
// TrailForks, a sparse feed whose region status can be a year old, a newer CAMBA
// post is the better report and takes over. It also surfaces trails with no
// other live source (CAMBA_NEW_TRAILS below).

// Maps a CAMBA trail id (the `p6_id` in its URL) to the app trail id it should
// refresh, so a home-page entry updates the trail we already track rather than
// duplicating it.
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

// Trails that only appear on the CAMBA home page (no other live source). Status,
// condition, and timestamp come from CAMBA at runtime; the metadata below is the
// rest of the card, and the source is the CAMBA trail page for the key. Locations
// are Maps-searchable but should be verified.
const CAMBA_NEW_TRAILS = {
	106: { id: 'mohican', location: 'JP5R+6Q Loudonville, Ohio', name: 'Mohican' },
	107: { id: 'vulturesknob', location: 'V229+9R Wooster, Ohio', name: "Vulture's Knob" },
	109: { id: 'camp-tuscazoar', location: 'GJW2+G2 Dover, Ohio', name: 'Camp Tuscazoar' },
	110: { id: 'thorn-ftp', location: '4QQP+98 Wellington, Ohio', name: 'Thorn (FTP)' },
	// 111 (Ray's Indoor) is intentionally NOT here: it runs on a fixed published
	// schedule, not condition-based open/close, so we compute its card from
	// RAYS_SCHEDULE below instead of taking CAMBA's guess.
	112: { id: 'lake-milton', location: '324M+H2 Lake Milton, Ohio', name: 'Lake Milton' },
	113: { id: 'huffman', location: 'RW44+2M Dayton, Ohio', name: 'Huffman' },
	114: { id: 'reagan-park', location: '5535+9W Medina, Ohio', name: 'Reagan Park' },
	115: { id: 'west-branch', location: '4VJ5+V4 Ravenna, Ohio', name: 'West Branch' },
	116: { id: 'quail-hollow', location: 'XMGQ+PR Hartville, Ohio', name: 'Quail Hollow' },
	117: { id: 'big-creek', location: 'JQ9V+89 Chardon, Ohio', name: 'Big Creek' }
};

// --- Ray's Indoor Mountain Bike Park --------------------------------------
// Ray's is an indoor park that runs on a fixed, published seasonal schedule
// rather than condition-based open/close, so there's nothing live to scrape.
// We transcribe the schedule from Ray's season-calendar graphics here and
// COMPUTE the card (open/closed + today's hours) from the current Eastern time.
// When Ray's publishes a new season, edit RAYS_SCHEDULE; that's the only change
// needed. All times are interpreted in America/New_York. Dates are "YYYY-MM-DD",
// which sort lexicographically the same as chronologically.
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
	// Date ranges, checked in order; first match wins (so nested/holiday ranges
	// come before the broad season they sit inside). `daily` applies every day;
	// `byDay` keys are 0=Sun..6=Sat and any missing weekday is closed.
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

// The Eastern wall-clock date, minutes since midnight and weekday of an instant.
// Plain local getters, because TZ is pinned to Eastern at the top of this file.
function easternParts(date) {
	const twoDigits = (value) => String(value).padStart(2, '0');
	return {
		ymd: `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`,
		minutes: date.getHours() * 60 + date.getMinutes(),
		weekday: date.getDay()
	};
}

// The Eastern calendar date one day after `ymd`. Stepping the date rather than
// adding 86400000 ms keeps this right across DST, where an Eastern day is 23 or
// 25 hours long. Date.UTC normalizes the month/year rollover for us.
function nextEasternDate(ymd) {
	const [year, month, day] = ymd.split('-').map(Number);
	const next = new Date(Date.UTC(year, month - 1, day + 1));
	return { weekday: next.getUTCDay(), ymd: next.toISOString().slice(0, 10) };
}

function timeToMinutes(time) {
	const match = /(\d+):(\d+)\s*(AM|PM)/i.exec(time ?? '');
	// Surfaces a typo in RAYS_SCHEDULE as a readable message rather than a
	// TypeError from somewhere deeper in the merge.
	if (!match) throw new Error(`Ray's schedule: cannot read the time ${JSON.stringify(time)}`);
	return ((+match[1] % 12) + (/pm/i.test(match[3]) ? 12 : 0)) * 60 + +match[2];
}

// Resolve a single day to { state: 'open'|'closed'|'unknown', open?, close?, label?, note? }.
// 'unknown' means no published rule covers the date (e.g. a future season).
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

// Build Ray's card from the schedule for the given instant (a parameter so the
// tests can pin the clock). timestamp is the start of the day, see below.
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

	// Stamp with the start of today (Eastern) so the card reads as refreshed each
	// day and sorts among recently-updated trails instead of sinking to the bottom
	// on a null timestamp. Off-season (unknown) has no daily update and should
	// stay at the end, so leave it unstamped.
	const timestamp = today.state === 'unknown' ? null : now.getTime() - minutes * 60000;
	return { ...RAYS_META, condition, status, timestamp, updatedAt: 'Updated daily from the published schedule' };
}

// buildRaysTrail is the one source that is computed rather than fetched, so it
// runs outside the Promise.allSettled that isolates the others. A typo in
// RAYS_SCHEDULE would otherwise reject the whole payload and take all 23 cards
// down with it, so failures degrade to the same stale card a dead source gets.
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

// Best-effort parse of a source's update time into epoch ms (null if unknown),
// used only to decide staleness. The display string stays whatever the source gave.
function parseMetroparksDate(raw) {
	const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d+):(\d+) (AM|PM)/);
	if (!match) return null;
	const [, month, day, year, hour, minute, period] = match;
	// Eastern wall-clock time, which the local Date constructor reads correctly
	// because TZ is pinned at the top of this file.
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

// Whole words only: a substring test for 'close' also matched "gates close at
// dusk" and "closely monitored", and it ran first, so those posts came out as a
// red Closed badge. The inflections are spelled out so "reopened", "opens" and
// "closing" still count. Closed still wins over open, because a post covering
// both is safer read as a closure.
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

// The Metroparks trail-status table: one row per trail with a status box, notes
// and an "updated" stamp. Parsing is separate from fetching here and in the
// other scrapers so the unit tests can feed each parser a saved copy of its page.
function parseMetroparks(html) {
	const $ = cheerio.load(html);
	const trails = [];

	$('.loc-status-table tbody tr').each((_, row) => {
		const $row = $(row);
		const name = $row.find('.loc-status-table-loc').text().trim();
		if (!name) return;

		// The source marks every row with one of these two classes. Anything else
		// means the markup moved under us, and a trail whose state we cannot read
		// grays out (and stays open to a CAMBA refresh) rather than being published
		// as closed.
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

// The CAMBA Trailmate home page lists every CAMBA-tracked trail as a single
// alert block: name + p6_id, latest post, relative time, status color. Returns
// one entry per trail keyed by p6_id; the merge maps them onto our trails.
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

// A TrailForks region page's "Region Status" block: a colored icon whose title
// is the condition, and an "as of" date. Throws when the block is missing, which
// is also what a Cloudflare challenge page looks like.
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

// The account's own latest post, as a card. posts_no_replies still returns
// reposts and pinned posts, both flagged with a `reason`, so those are skipped.
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

// Every trail we know how to render, with the metadata used both for its live
// card and for a grayed-out fallback when its source is unreachable. Pooling all
// metadata in one registry lets a failed fetch gray a card out instead of
// dropping it from the page entirely.
const KNOWN_TRAILS = [
	...Object.entries(TRAIL_META).map(([name, meta]) => ({ ...meta, name, source: METROPARKS_SOURCE })),
	...BSKY_ACCOUNTS.map(({ id, location, name, source }) => ({ id, location, name, source })),
	CVNP_EAST_RIM,
	...TRAILFORKS_REGIONS,
	...Object.entries(CAMBA_NEW_TRAILS).map(([p6Id, meta]) => ({ ...meta, source: cambaSource(Number(p6Id)) }))
];

// Expand multi-trailhead trails into one card per lot, sharing status/condition/
// timestamp but with each lot's own name and location.
const splitTrailheads = (trail) =>
	(TRAILHEAD_SPLITS[trail.id] ?? [trail]).map((head) =>
		head === trail ? trail : { ...trail, id: head.id, location: head.location, name: head.name }
	);

// One stale placeholder per known card, used for any trail that produced no live
// data this cycle. Deliberately left unsplit: the CAMBA refresh runs over these
// and its entries are keyed to the parent trail id, not to each lot, so the
// split happens after that refresh.
const FALLBACK_CARDS = KNOWN_TRAILS.map((trail) => ({
	...trail,
	condition: NO_LIVE_DATA,
	status: 'stale',
	timestamp: null,
	updatedAt: '-'
}));

// --- Weather -----------------------------------------------------------------
// Every outdoor card carries the weather at its trailhead: the current hour on
// the card, and the National Weather Service forecast for the next five days
// in the dialog behind it, with a link to the point forecast page for the
// same spot.
//
// The coordinates are the Plus Codes in each card's `location`, decoded once
// (open-location-code, with the town named beside each code as the reference)
// and kept here so nothing has to geocode at runtime. The NWS forecasts by
// 2.5 km grid cell rather than by point, and a point's cell comes from
// https://api.weather.gov/points/<latitude>,<longitude>. That never changes
// for a fixed point, so each was looked up once too and kept as `grid`: the
// forecast office, then the cell's x,y in that office's grid.
// Keyed by card id, so each lot of a split trail has its own entry. Ray's is
// indoors and left out on purpose; any other card missing here shows no
// weather, and the check below says so at startup.
const nwsPointForecastPage = (latitude, longitude) =>
	`https://forecast.weather.gov/MapClick.php?lat=${latitude}&lon=${longitude}`;
const trailheadAt = (grid, latitude, longitude) => ({
	forecastUrl: nwsPointForecastPage(latitude, longitude),
	grid,
	latitude,
	longitude
});

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

// Trailheads in one grid cell get one forecast, so each distinct cell is asked
// once and every card looks its answer up by this key.
const weatherKey = (point) => point.grid;
const WEATHER_CELLS = [...new Set(Object.values(TRAILHEADS).map(weatherKey))];

const nwsForecastUrl = (grid) => `${NWS_API}/gridpoints/${grid}/forecast`;
const nwsHourlyForecastUrl = (grid) => `${NWS_API}/gridpoints/${grid}/forecast/hourly`;

async function fetchNws(url) {
	const res = await fetch(url, { headers: NWS_HEADERS, signal: AbortSignal.timeout(10000) });
	if (!res.ok) throw new Error(`weather.gov HTTP ${res.status}`);
	return res.json();
}

// The condition behind a period, named the way the NWS names its icons: skc,
// few, sct, bkn and ovc for sky cover, then rain_showers, tsra, snow, fog and
// the rest (the full list is at https://api.weather.gov/icons). It is read off
// the icon URL, .../icons/land/<day|night>/<condition>[,<chance>][/<condition>
// [,<chance>]]: a period that changes partway carries two, and the first is
// how it starts. A windy version carries a wind_ prefix, which the glyph has
// no way to show.
const conditionFromIcon = (icon) => {
	const match = /\/icons\/land\/(?:day|night)\/(?:wind_)?([a-z_]+)/.exec(icon ?? '');
	return match ? match[1] : null;
};

// The NWS lists the icon URLs as deprecated, though every period still carries
// one. Should they go, the short forecast is enough to pick a glyph: the first
// pattern that matches is what the period starts with ("Rain Showers Likely
// then Mostly Cloudy" is rain).
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
// A moment's calendar date on this process's Eastern clock, counted in days so
// two dates subtract to the days between them.
const dayNumber = (date) => Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / DAY_MS);
// The same date written YYYY-MM-DD, which is how the dialog groups its rows and
// how Open-Meteo writes its days.
const localDate = (date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// What the card and its dialog show of a period: the condition for the glyph,
// the short forecast for the tooltip and the row, the temperature (a high by
// day, a low by night, the reading itself for the current hour), the chance of
// rain or snow, which the NWS leaves null when there is none, and the day the
// dialog files it under. That is the day it starts, except that a period
// already under way belongs to today: at half past midnight the night that
// began yesterday evening sits with the current hour, not under yesterday.
const conditionsOf = (period, now) => ({
	condition: conditionFromIcon(period.icon) ?? conditionFromText(period.shortForecast),
	date: localDate(new Date(Math.max(Date.parse(period.startTime), now))),
	description: period.shortForecast,
	isDay: period.isDaytime,
	precipitationChance: period.probabilityOfPrecipitation?.value ?? 0,
	temperature: period.temperature
});

// The periods still to come, through the end of the fifth day counting today:
// a forecast built in the evening leads with "Tonight" and four full days
// follow it. A period that began before now but has not ended, which is what
// last evening's "Tonight" is in the small hours, stays.
const withinForecastDays = (periods, now) => {
	const today = dayNumber(new Date(now));
	return periods.filter(
		(period) => Date.parse(period.endTime) > now && dayNumber(new Date(period.startTime)) - today < FORECAST_DAYS
	);
};

// The two forecasts for a grid cell, cut down to what the cards carry. The
// current hour is the hourly forecast's period for now: the NWS has no "right
// now" for a point, and its observations come from airports miles from any
// trailhead. The dialog's rows are the day and night periods of the forecast
// proper, through the end of the fifth day counting today.
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

// Weather for every grid cell, keyed by weatherKey. A cell whose request fails
// is left out so only its cards go without; the source counts as down only
// when every cell failed.
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

// --- Past days ----------------------------------------------------------------
// The three days before today at each trailhead, for what the trail has been
// through: a wet weekend matters more to Monday's ride than Monday's sky. The
// NWS has nothing for a point's past (its observations are airport readings,
// megabytes a day of them, with rainfall mostly left blank), so these come from
// Open-Meteo, which answers for every trailhead in one keyless request with a
// WMO weather code, the high, the low and the rainfall for each day.
const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';
const HISTORY_DAYS = 3;

// Open-Meteo works by coordinates, so this is keyed by point: lots that share a
// trailhead share a point, and a cell with two lots apart gets two.
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

// WMO weather codes, of which Open-Meteo reports a day's most severe, named the
// way the NWS names the same conditions so WeatherIcon.tsx draws them alike,
// with the words the dialog shows for each.
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

// One location's past days, oldest first. Today is left out, since the card's
// own reading covers it, and so is any day with a reading missing: a row that
// said 0 for a blank would be a lie about the rain.
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

// Past days for every point, keyed by pointKey, from one request for the lot.
// Open-Meteo answers a single location with an object and several with an
// array, in the order they were asked.
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

// The card's weather object: the current hour and the forecast for its cell,
// the past days for its point (an empty list when that source was down) and
// the link to the full forecast. Null when the card has no trailhead entry or
// the forecast fetch failed: without the current hour there is no chip to open
// the rest from.
const weatherFor = (trailId, weather, history) => {
	const trailhead = TRAILHEADS[trailId];
	const forecast = trailhead && weather.get(weatherKey(trailhead));
	if (!forecast) return null;
	return { ...forecast, forecastUrl: trailhead.forecastUrl, history: history.get(pointKey(trailhead)) ?? [] };
};

// How many of a source's cards carry a real reading. A source whose markup moved
// still returns rows, so counting non-stale cards is what tells a live scrape
// from one that fell through to placeholders.
const liveCount = (trails) => trails.filter((trail) => trail.status !== 'stale').length;

let inFlightScrape = null;

export async function getTrailsPayload() {
	if (cachedPayload && Date.now() < cacheExpiry) {
		return cachedPayload;
	}
	// One scrape at a time. Without this, every request that arrives on a cold
	// cache runs its own copy of every fetch plus a curl subprocess.
	inFlightScrape ??= scrapeEverySource().finally(() => {
		inFlightScrape = null;
	});
	return inFlightScrape;
}

// Whether every source that carries real trail status came back with nothing.
// TrailForks is left out: it covers a few community-reported regions and says
// nothing about whether those sources are up.
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

	// If every live source failed, serve the last good payload rather than a page of
	// all-stale fallbacks. With no cache we fall through and render the fallbacks.
	const allDown = everyStatusSourceDown(fetched);
	if (allDown && cachedPayload) {
		cacheExpiry = Date.now() + RETRY_AFTER_FAILURE;
		return cachedPayload;
	}

	const now = Date.now();
	cachedPayload = { cachedAt: now, ...mergeTrails(fetched, now) };
	// A page of placeholders (every source down and nothing cached yet, as on a
	// restart during an outage) is worth retrying soon rather than serving for
	// the full hour.
	cacheExpiry = now + (allDown ? RETRY_AFTER_FAILURE : CACHE_TTL);
	return cachedPayload;
}

// The merge: every fetched card with CAMBA's entries applied by the rules below,
// a stale placeholder for any known trail that produced nothing, lots split into
// their own cards, and weather attached. A pure function of its inputs and the
// clock, which is what the unit tests lean on.
function mergeTrails({ bsky, cambaHome, history, metroparks, trailforks, weather }, now) {
	// Index CAMBA home entries: matched ones refresh a trail we already track,
	// unmatched-but-known ones become new cards.
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

	// For a trail whose primary source CAMBA mirrors: CAMBA stands in only when
	// that source produced nothing readable. A live row always wins, even when
	// CAMBA's coarse "28 hours ago" rounds to a moment after the exact Metroparks
	// time; that used to hand the card to a copy of the same post.
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

	// Keep `status` as the last-known condition and flag staleness separately, so
	// the UI can show the last status grayed out rather than losing it. Ordering is
	// the frontend's job (src/App.tsx sorts on the reader's chosen key), so the
	// payload stays in source order.
	const live = [...metroparks.map(fillFromCamba), ...bsky.map(fillFromCamba), ...trailforks.map(refreshWithCamba)]
		.concat(cambaNew, raysTrailOrFallback(new Date(now)))
		.flatMap(splitTrailheads);

	// Add a stale fallback card for every known trail that produced no live data,
	// so a source outage grays a card out instead of removing it from the page.
	// CAMBA fills these in too: it is where East Rim's status comes from, and it
	// means CAMBA can cover any trail whose primary source went down.
	const liveIds = new Set(live.map((trail) => trail.id));
	const missing = FALLBACK_CARDS.map(fillFromCamba)
		.flatMap(splitTrailheads)
		.filter((trail) => !liveIds.has(trail.id));

	const trails = live.concat(missing).map((trail) => {
		const timestamp = trail.timestamp ?? null;
		const stale = trail.status === 'stale' || (timestamp != null && now - timestamp > STALE_AFTER);
		return { ...trail, stale, timestamp, weather: weatherFor(trail.id, weather, history) };
	});

	// How many cards each source produced (grid cells for weather, trailhead
	// points for the past days), so a caller can tell a real scrape from one
	// that fell through to placeholders.
	// scripts/build-data.mjs uses it to decide whether to keep the previously
	// published file.
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

// The source addresses are exported for scripts/probe-sources.mjs, so the probe
// checks the URLs this file really uses rather than a second copy of them. The
// parsers, the merge and the pure helpers are exported for test/unit, which
// feeds them saved pages and fixed clocks instead of the live sources.
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
