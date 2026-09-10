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
const BSKY_API = 'https://public.api.bsky.app/xrpc';
const bskyFeedUrl = (handle) =>
	`${BSKY_API}/app.bsky.feed.getAuthorFeed?actor=${handle}&limit=10&filter=posts_no_replies`;
const CACHE_TTL = 60 * 60 * 1000;
const STALE_AFTER = 7 * 24 * 60 * 60 * 1000; // a week
const STATUS_ORDER = { caution: 1, closed: 2, open: 0, stale: 3 };

const TRAIL_META = {
	'Bedford - Single Track': {
		id: 'bedford-single',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/bedford-reservation/' }
		],
		location: '9C5P+GH Walton Hills, Ohio'
	},
	'Ohio & Erie Canal - Flow Trail': {
		id: 'oec-flow',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/ohio--erie-canal-reservation/' }
		],
		location: 'C8JQ+92 Cleveland, Ohio'
	},
	'Ohio & Erie Canal - Primitive Loop & Canal Trail': {
		id: 'oec-primitive',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/ohio--erie-canal-reservation/' }
		],
		location: 'C8JQ+92 Cleveland, Ohio'
	},
	'Ohio & Erie Canal - Pump Track': {
		id: 'oec-pump',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/ohio--erie-canal-reservation/' }
		],
		location: 'C8JQ+92 Cleveland, Ohio'
	},
	'Royalview - Red Loop': {
		id: 'royalview-red',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/trails/royalview-red-trail/' }
		],
		location: '8664+8H Strongsville, Ohio'
	},
	'Royalview - Yellow Loop': {
		id: 'royalview-yellow',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/trails/royalview-yellow/' }
		],
		location: '852W+87 Strongsville, Ohio'
	},
	'West Creek - Mountain Bike Trails': {
		id: 'west-creek',
		links: [
			{ name: 'Cleveland Metroparks', url: METROPARKS_URL },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/hampton-hills-15249/' }
		],
		location: '98Q4+68 Parma, Ohio'
	}
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

const BSKY_ACCOUNTS = [
	{
		handle: 'smpmountainbike.bsky.social',
		id: 'hampton-hills',
		links: [
			{ name: 'Bluesky - @smpmountainbike', url: 'https://bsky.app/profile/smpmountainbike.bsky.social' },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/hampton-hills-15249/' }
		],
		location: '5C2X+FP Akron, Ohio',
		name: 'Hampton Hills'
	}
];

// Status, condition and timestamp come from the CAMBA home page like every other
// CAMBA trail (p6_id 103 in CAMBA_TRAIL_IDS below); this is just the card around
// them. It used to have its own scraper pointed at camba.dualrates.com, but that
// host 302s every trail page to the home page, so the scrape parsed nothing and
// the home-page entry was quietly doing the work anyway.
const CVNP_EAST_RIM = {
	id: 'cvnp-east-rim',
	links: [
		{ name: 'CAMBA Trailmate', url: cambaTrailUrl(103) },
		{ name: 'X - @cvnpmtb', url: 'https://x.com/cvnpmtb' },
		{ name: 'NPS Conditions', url: 'https://www.nps.gov/cuva/planyourvisit/conditions.htm' },
		{ name: 'TrailForks', url: 'https://www.trailforks.com/region/east-rim-trails/' }
	],
	location: '7F4J+3C Peninsula, Ohio',
	name: 'CVNP East Rim'
};

// Scraped from TrailForks region "Region Status" (community-reported conditions).
const TRAILFORKS_REGIONS = [
	{
		id: 'austin-badger',
		links: [
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/austin-badger-park-17345/' },
			{ name: "Facebook - Wick's Outlaw Trails", url: 'https://www.facebook.com/WicksOutlawTrails/' },
			{ name: 'Instagram - @wicks_outlaw_trails', url: 'https://www.instagram.com/wicks_outlaw_trails/' }
		],
		location: '459P+6R Medina, Ohio',
		name: 'Austin Badger Park',
		url: 'https://www.trailforks.com/region/austin-badger-park-17345/'
	}
];

// The CAMBA Trailmate home page lists every CAMBA-tracked trail in a single
// fetch (community-reported conditions, same platform as CVNP East Rim). We use
// it as a fallback: when a trail's primary source is missing or older than the
// CAMBA post, the CAMBA status wins. It also surfaces trails with no other live
// source (CAMBA_NEW_TRAILS below).

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
// rest of the card. Locations are Maps-searchable but should be verified.
const CAMBA_NEW_TRAILS = {
	106: {
		id: 'mohican',
		links: [
			{ name: 'CAMBA Trailmate', url: cambaTrailUrl(106) },
			{ name: 'Ohio DNR', url: 'https://ohiodnr.gov/go-and-do/plan-a-visit/find-a-property/mohican-state-park' },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/mohican-state-park/' }
		],
		location: 'JP5R+6Q Loudonville, Ohio',
		name: 'Mohican'
	},
	107: {
		id: 'vulturesknob',
		links: [
			{ name: 'CAMBA Trailmate', url: cambaTrailUrl(107) },
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/vultures-knob/' }
		],
		location: 'V229+9R Wooster, Ohio',
		name: "Vulture's Knob"
	},
	109: {
		id: 'camp-tuscazoar',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(109) }],
		location: 'GJW2+G2 Dover, Ohio',
		name: 'Camp Tuscazoar'
	},
	110: {
		id: 'thorn-ftp',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(110) }],
		location: '4QQP+98 Wellington, Ohio',
		name: 'Thorn (FTP)'
	},
	// 111 (Ray's Indoor) is intentionally NOT here: it runs on a fixed published
	// schedule, not condition-based open/close, so we compute its card from
	// RAYS_SCHEDULE below instead of taking CAMBA's guess.
	112: {
		id: 'lake-milton',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(112) }],
		location: '324M+H2 Berlin Center, Ohio',
		name: 'Lake Milton'
	},
	113: {
		id: 'huffman',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(113) }],
		location: 'RW44+2M Dayton, Ohio',
		name: 'Huffman'
	},
	114: {
		id: 'reagan-park',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(114) }],
		location: '5535+9W Medina, Ohio',
		name: 'Reagan Park'
	},
	115: {
		id: 'west-branch',
		links: [
			{ name: 'CAMBA Trailmate', url: cambaTrailUrl(115) },
			{
				name: 'Ohio DNR',
				url: 'https://ohiodnr.gov/go-and-do/plan-a-visit/find-a-property/west-branch-state-park'
			},
			{ name: 'TrailForks', url: 'https://www.trailforks.com/region/west-branch-state-park/' }
		],
		location: '4VJ5+V4 Ravenna, Ohio',
		name: 'West Branch'
	},
	116: {
		id: 'quail-hollow',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(116) }],
		location: 'XMGQ+PR Hartville, Ohio',
		name: 'Quail Hollow'
	},
	117: {
		id: 'big-creek',
		links: [{ name: 'CAMBA Trailmate', url: cambaTrailUrl(117) }],
		location: 'JQ9V+89 Chardon, OH',
		name: 'Big Creek'
	}
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
	links: [
		{
			name: "Ray's prices, hours, and directions",
			url: 'https://www.raysmtb.com/about/prices-hours-and-directions-pg141.htm'
		}
	],
	location: 'F63X+V3 Cleveland, Ohio',
	name: "Ray's Indoor Mountain Bike Park"
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
				0: { open: '12:00 PM', close: '10:00 PM' },
				1: { open: '9:00 AM', close: '10:00 PM' },
				2: { open: '9:00 AM', close: '10:00 PM' },
				3: { open: '9:00 AM', close: '10:00 PM' },
				4: { open: '9:00 AM', close: '10:00 PM' },
				5: { open: '9:00 AM', close: '10:00 PM' },
				6: { open: '12:00 PM', close: '10:00 PM' }
			}
		},
		{ from: '2026-09-01', to: '2026-10-01', label: 'Fall hours', daily: { open: '2:00 PM', close: '8:00 PM' } },
		{
			from: '2026-05-10',
			to: '2026-09-06',
			label: 'Summer Sessions',
			byDay: { 0: { open: '2:00 PM', close: '8:00 PM' } }
		}
	]
};

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The current Eastern wall-clock date/time, independent of the server's own zone.
function easternParts(date) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone: 'America/New_York',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			weekday: 'short'
		})
			.formatToParts(date)
			.map((p) => [p.type, p.value])
	);
	return {
		ymd: `${parts.year}-${parts.month}-${parts.day}`,
		minutes: (+parts.hour % 24) * 60 + +parts.minute,
		weekday: WEEKDAY_INDEX[parts.weekday]
	};
}

function timeToMinutes(t) {
	const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
	return ((+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + +m[2];
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
function raysNextOpen(now) {
	for (let i = 1; i <= 28; i++) {
		const { ymd, weekday } = easternParts(new Date(now.getTime() + i * 86400000));
		const day = raysDay(ymd, weekday);
		if (day.state === 'open') {
			const when = i === 1 ? 'tomorrow' : WEEKDAY_NAMES[weekday];
			return ` Next open ${when} ${day.open}-${day.close}.`;
		}
	}
	return '';
}

// Build Ray's card from the schedule. timestamp is null so the card never goes
// "stale" and the footer's relative-time stamp (meaningless here) stays hidden.
function buildRaysTrail() {
	const now = new Date();
	const { ymd, minutes, weekday } = easternParts(now);
	const today = raysDay(ymd, weekday);
	const tag = today.label ? ` - ${today.label}` : '';
	let status;
	let condition;

	if (today.state === 'unknown') {
		status = 'stale';
		condition =
			'Indoor park on a fixed seasonal schedule. The current season is not yet published here. See the links below for hours.';
	} else if (today.state === 'closed') {
		status = 'closed';
		condition = `Closed today${today.label ? ` (${today.label})` : ''}.${raysNextOpen(now)}`;
	} else {
		const open = timeToMinutes(today.open);
		const close = timeToMinutes(today.close);
		if (minutes < open) {
			status = 'caution';
			condition = `Opens today at ${today.open}. Today's hours ${today.open}-${today.close}${tag}.`;
		} else if (minutes >= close) {
			status = 'closed';
			condition = `Closed for the day (today was ${today.open}-${today.close}${tag}).${raysNextOpen(now)}`;
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
	const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d+):(\d+) (AM|PM)/);
	if (!m) return null;
	const [, month, day, year, hour, minute, period] = m;
	const h = (+hour % 12) + (period === 'PM' ? 12 : 0);
	return new Date(+year, +month - 1, +day, h, +minute).getTime();
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

function inferStatus(text) {
	const lower = text.toLowerCase();
	if (lower.includes('closed') || lower.includes('close')) return 'closed';
	if (lower.includes('open')) return 'open';
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

async function scrapeMetroparks() {
	const res = await fetch(METROPARKS_URL, {
		headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CLE-MTB-Status/1.0)' },
		signal: AbortSignal.timeout(10000)
	});
	if (!res.ok) throw new Error(`Metroparks HTTP ${res.status}`);

	const $ = cheerio.load(await res.text());
	const trails = [];

	$('.loc-status-table tbody tr').each((_, row) => {
		const $row = $(row);
		const name = $row.find('.loc-status-table-loc').text().trim();
		if (!name) return;

		const statusBox = $row.find('.loc-status-table-status-box');
		const status = statusBox.hasClass('loc-status-open') ? 'open' : 'closed';
		const notes = $row.find('.loc-status-table-wrap').text().trim();
		const rawDate = $row.find('td').eq(3).text().trim();
		const meta = TRAIL_META[name] ?? {
			id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
			links: [{ name: 'Cleveland Metroparks', url: METROPARKS_URL }],
			location: 'Cleveland Metroparks'
		};

		trails.push({
			condition: notes || (status === 'open' ? 'No issues reported' : 'No additional notes'),
			id: meta.id,
			links: meta.links,
			location: meta.location,
			name,
			status,
			timestamp: parseMetroparksDate(rawDate),
			updatedAt: formatUpdatedAt(rawDate)
		});
	});

	return trails;
}

function cambaHomeStatus(className, text) {
	if (className.includes('t-Alert--success')) return 'open';
	if (className.includes('t-Alert--danger')) return 'closed';
	if (className.includes('t-Alert--warning')) return 'caution';
	return inferStatus(text); // e.g. the "info" alert for a seasonal park
}

// Scrape the CAMBA Trailmate home page, which lists every CAMBA-tracked trail as
// a single alert block: name + p6_id, latest post, relative time, status color.
// Returns one entry per trail keyed by p6_id; callers map it onto our trails.
async function scrapeCambaHome() {
	const res = await fetch(CAMBA_HOME_URL, {
		headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CLE-MTB-Status/1.0)' },
		signal: AbortSignal.timeout(10000)
	});
	if (!res.ok) throw new Error(`CAMBA home HTTP ${res.status}`);

	const $ = cheerio.load(await res.text());
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

function trailforksStatus(iconClass) {
	if (/\bsgreen\b/.test(iconClass)) return 'open';
	if (/\bsred\b/.test(iconClass)) return 'closed';
	if (/\bs(yellow|orange|blue)\b/.test(iconClass)) return 'caution';
	return 'stale';
}

async function fetchTrailforksRegions() {
	return Promise.all(
		TRAILFORKS_REGIONS.map(async (region) => {
			try {
				const $ = cheerio.load(await curlText(region.url));
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
					links: region.links,
					location: region.location,
					name: region.name,
					status: trailforksStatus(icon.attr('class') ?? ''),
					timestamp: asOf ? parseRelativeOrDate(asOf) : null,
					updatedAt: asOf || '-'
				};
			} catch {
				return {
					condition: 'No live data. Check the links below for current conditions.',
					id: region.id,
					links: region.links,
					location: region.location,
					name: region.name,
					status: 'stale',
					updatedAt: '-'
				};
			}
		})
	);
}

async function fetchBskyTrails() {
	const results = await Promise.allSettled(
		BSKY_ACCOUNTS.map(async (account) => {
			const res = await fetch(bskyFeedUrl(account.handle), { signal: AbortSignal.timeout(10000) });
			if (!res.ok) throw new Error(`Bluesky HTTP ${res.status}`);

			const data = await res.json();
			const post = data.feed?.[0]?.post;
			if (!post) throw new Error('No posts found');

			const text = post.record?.text ?? '';
			const rkey = post.uri.split('/').pop();
			const postUrl = `https://bsky.app/profile/${account.handle}/post/${rkey}`;

			const links = [{ name: account.links[0].name, url: postUrl }, ...account.links.slice(1)];

			return {
				condition: text,
				id: account.id,
				links,
				location: account.location,
				name: account.name,
				status: inferStatus(text),
				timestamp: Date.parse(post.indexedAt),
				updatedAt: formatBskyDate(post.indexedAt)
			};
		})
	);

	return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
}

// Every trail we know how to render, with the metadata used both for its live
// card and for a greyed-out fallback when its source is unreachable. Pooling all
// metadata in one registry lets a failed fetch grey a card out instead of
// dropping it from the page entirely.
const KNOWN_TRAILS = [
	...Object.entries(TRAIL_META).map(([name, m]) => ({ id: m.id, links: m.links, location: m.location, name })),
	...BSKY_ACCOUNTS.map((a) => ({ id: a.id, links: a.links, location: a.location, name: a.name })),
	{ id: CVNP_EAST_RIM.id, links: CVNP_EAST_RIM.links, location: CVNP_EAST_RIM.location, name: CVNP_EAST_RIM.name },
	...TRAILFORKS_REGIONS.map((r) => ({ id: r.id, links: r.links, location: r.location, name: r.name })),
	...Object.values(CAMBA_NEW_TRAILS).map((m) => ({ id: m.id, links: m.links, location: m.location, name: m.name }))
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
	condition: 'No live data. Check the links below for current conditions.',
	status: 'stale',
	timestamp: null,
	updatedAt: '-'
}));

export async function getTrailsPayload() {
	if (cachedPayload && Date.now() < cacheExpiry) {
		return cachedPayload;
	}

	const [metroparksResult, bskyResult, trailforksResult, cambaHomeResult] = await Promise.allSettled([
		scrapeMetroparks(),
		fetchBskyTrails(),
		fetchTrailforksRegions(),
		scrapeCambaHome()
	]);

	const metroparks = metroparksResult.status === 'fulfilled' ? metroparksResult.value : [];
	const bsky = bskyResult.status === 'fulfilled' ? bskyResult.value : [];
	const trailforks = trailforksResult.status === 'fulfilled' ? trailforksResult.value : [];
	const cambaHome = cambaHomeResult.status === 'fulfilled' ? cambaHomeResult.value : [];

	// If every live source failed, serve the last good payload rather than a page of
	// all-stale fallbacks. With no cache we fall through and render the fallbacks.
	if (metroparks.length === 0 && bsky.length === 0 && cambaHome.length === 0 && cachedPayload) {
		return cachedPayload;
	}

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
				links: meta.links,
				location: meta.location,
				name: meta.name,
				status: entry.status,
				timestamp: entry.timestamp,
				updatedAt: entry.updatedAt
			});
		}
	}

	// Fallback: let CAMBA refresh a tracked trail when our primary source is
	// missing/stale or the CAMBA post is newer.
	const refreshWithCamba = (trail) => {
		const entry = cambaById.get(trail.id);
		if (!entry) return trail;
		const fresher =
			trail.timestamp == null ||
			trail.status === 'stale' ||
			(entry.timestamp != null && entry.timestamp > trail.timestamp);
		if (!fresher) return trail;
		return {
			...trail,
			condition: entry.condition || trail.condition,
			status: entry.status,
			timestamp: entry.timestamp,
			updatedAt: entry.updatedAt
		};
	};

	const now = Date.now();
	// Keep `status` as the last-known condition; flag staleness separately so the
	// UI can show the last status greyed out rather than losing it. Order: fresh
	// trails by status, then stale trails that still have a last-known status,
	// then pure-stale trails with no state at all at the very bottom.
	const rank = (trail) => {
		if (!trail.stale) return STATUS_ORDER[trail.status];
		return trail.status === 'stale' ? STATUS_ORDER.stale + 1 : STATUS_ORDER.stale;
	};
	const live = [...metroparks, ...bsky, ...trailforks]
		.map(refreshWithCamba)
		.concat(cambaNew, buildRaysTrail())
		.flatMap(splitTrailheads);

	// Add a stale fallback card for every known trail that produced no live data,
	// so a source outage greys a card out instead of removing it from the page.
	// These get the CAMBA refresh too: it is where East Rim's status comes from,
	// and it means CAMBA can cover any trail whose primary source went down.
	const liveIds = new Set(live.map((trail) => trail.id));
	const missing = FALLBACK_CARDS.map(refreshWithCamba)
		.flatMap(splitTrailheads)
		.filter((trail) => !liveIds.has(trail.id));

	const trails = live
		.concat(missing)
		.map((trail) => {
			const timestamp = trail.timestamp ?? null;
			const stale = trail.status === 'stale' || (timestamp != null && now - timestamp > STALE_AFTER);
			return { ...trail, stale, timestamp };
		})
		.sort((a, b) => rank(a) - rank(b));

	// How many cards each source produced, so a caller can tell a real scrape from
	// one that fell through to placeholders. scripts/build-data.mjs uses it to
	// decide whether to keep the previously published file.
	const sources = {
		bsky: bsky.length,
		cambaHome: cambaHome.length,
		metroparks: metroparks.length,
		trailforks: trailforks.filter((trail) => trail.status !== 'stale').length
	};

	cachedPayload = { cachedAt: now, sources, trails };
	cacheExpiry = now + CACHE_TTL;
	return cachedPayload;
}

// The source addresses are exported for scripts/probe-sources.mjs, so the probe
// checks the URLs this file really uses rather than a second copy of them.
export { BSKY_ACCOUNTS, bskyFeedUrl, CAMBA_HOME_URL, METROPARKS_URL, TRAILFORKS_REGIONS };
