// Source-health probe. It answers one question: is each live source actually
// serving the markup we parse, from wherever this happens to be running?
//
// It was written to settle whether GitHub's runners get blocked where a home
// connection does not, and it earns its keep after that as the thing to run when
// a card goes grey: it says which source stopped answering, which the page
// itself cannot tell you (a failed source looks the same as a quiet trail).
//
// Bot blocking rarely looks like an error. A challenge or geo-block page comes
// back as HTTP 200 with none of the markup the scraper needs, so each source is
// judged by the anchor it has to find, not by the status code. The addresses
// come from lib/trails.mjs so there is one copy of them; the selectors are the
// scrapers' own, restated here because the point is to check them from outside.
//
// Run: yarn probe   (writes probe-report.md, exits nonzero if a source failed)
import * as cheerio from 'cheerio';
import { execFile } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

import {
	BSKY_ACCOUNTS,
	bskyFeedUrl,
	CAMBA_HOME_URL,
	getTrailsPayload,
	METROPARKS_URL,
	TRAILFORKS_REGIONS
} from '../lib/trails.mjs';

const execFileAsync = promisify(execFile);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPORT_PATH = path.join(ROOT, 'probe-report.md');

const SCRAPER_USER_AGENT = 'Mozilla/5.0 (compatible; CLE-MTB-Status/1.0)';
const CURL_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const REQUEST_TIMEOUT_MS = 10000;

const SOURCES = [
	{
		carries: 'Bedford, Ohio & Erie, Royalview, West Creek (9 cards after lot splits)',
		measure: (body) => {
			const rows = cheerio.load(body)('.loc-status-table tbody tr').length;
			return { detail: `${rows} rows in .loc-status-table`, ok: rows > 0 };
		},
		name: 'Cleveland Metroparks',
		transport: 'fetch',
		url: METROPARKS_URL
	},
	{
		carries: 'the CAMBA-only cards, East Rim, and the fallback refresh for every other trail',
		measure: (body) => {
			const alerts = cheerio.load(body)('#TrailMate_alerts .t-Alert').length;
			return { detail: `${alerts} alerts in #TrailMate_alerts`, ok: alerts > 0 };
		},
		name: 'CAMBA Trailmate (home)',
		transport: 'fetch',
		url: CAMBA_HOME_URL
	},
	{
		carries: `${TRAILFORKS_REGIONS[0].name} (already falls back to stale by design)`,
		measure: (body) => {
			const $ = cheerio.load(body);
			const container = $('.grey')
				.filter((_, el) => $(el).text().trim() === 'Region Status')
				.first()
				.parent();
			const icons = container.find('.sicon_small').length;
			return { detail: `${icons} region-status icons`, ok: icons > 0 };
		},
		name: `TrailForks (${TRAILFORKS_REGIONS[0].name})`,
		transport: 'curl',
		url: TRAILFORKS_REGIONS[0].url
	},
	{
		carries: BSKY_ACCOUNTS[0].name,
		measure: (body) => {
			const posts = JSON.parse(body).feed?.length ?? 0;
			return { detail: `${posts} posts in the author feed`, ok: posts > 0 };
		},
		name: `Bluesky (@${BSKY_ACCOUNTS[0].handle.split('.')[0]})`,
		transport: 'fetch',
		url: bskyFeedUrl(BSKY_ACCOUNTS[0].handle)
	}
];

async function fetchWithNode(url) {
	const response = await fetch(url, {
		headers: { 'User-Agent': SCRAPER_USER_AGENT },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});
	return { body: await response.text(), httpStatus: response.status, transportOk: response.ok };
}

// TrailForks sits behind Cloudflare, which 403s Node's fetch on TLS fingerprint,
// so the scraper shells out to curl. Same call here, plus -w to recover the
// status code that curl otherwise keeps out of the body.
async function fetchWithCurl(url) {
	const { stdout } = await execFileAsync(
		'curl',
		['-s', '-L', '--max-time', '10', '-w', '\n%{http_code}', '-A', CURL_USER_AGENT, url],
		{ maxBuffer: 16 * 1024 * 1024 }
	);
	const split = stdout.lastIndexOf('\n');
	const httpStatus = Number(stdout.slice(split + 1)) || 0;
	return { body: stdout.slice(0, split), httpStatus, transportOk: httpStatus >= 200 && httpStatus < 400 };
}

async function probeSource(source) {
	const startedAt = Date.now();
	const result = { carries: source.carries, name: source.name };
	try {
		const fetcher = source.transport === 'curl' ? fetchWithCurl : fetchWithNode;
		const { body, httpStatus, transportOk } = await fetcher(source.url);
		const elapsedMs = Date.now() - startedAt;
		if (!transportOk) {
			return { ...result, bytes: body.length, detail: 'request rejected', elapsedMs, httpStatus, ok: false };
		}
		const { detail, ok } = source.measure(body);
		return { ...result, bytes: body.length, detail, elapsedMs, httpStatus, ok };
	} catch (error) {
		const elapsedMs = Date.now() - startedAt;
		return { ...result, bytes: 0, detail: error.message, elapsedMs, httpStatus: 0, ok: false };
	}
}

// Which address the requests went out from. Comparing a CI run against a local
// one is the whole point, so the address belongs in the report. Best effort.
async function findEgressAddress() {
	try {
		const response = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		return (await response.text()).trim();
	} catch {
		return 'unknown';
	}
}

// The same call scripts/build-data.mjs makes, so the merged result is measured
// rather than inferred from the per-source checks above.
async function readMergedTrails() {
	try {
		const payload = await getTrailsPayload();
		const trails = payload.trails;
		return {
			cachedAt: new Date(payload.cachedAt).toISOString(),
			noLiveData: trails.filter((trail) => trail.status === 'stale').map((trail) => trail.name),
			overAWeekOld: trails.filter((trail) => trail.stale && trail.status !== 'stale').map((trail) => trail.name),
			sources: payload.sources,
			total: trails.length
		};
	} catch (error) {
		return { error: error.message };
	}
}

function buildReport({ egressAddress, merged, results }) {
	const failed = results.filter((result) => !result.ok);
	const lines = [
		'# Source probe report',
		'',
		`- Ran: ${new Date().toISOString()}`,
		`- Where: ${process.env.GITHUB_ACTIONS ? `GitHub Actions (${process.env.RUNNER_OS})` : 'local machine'}`,
		`- Egress address: ${egressAddress}`,
		`- Node: ${process.version}`,
		'',
		'## Sources',
		'',
		'| Source | Result | HTTP | Bytes | Time | What came back |',
		'| --- | --- | --- | --- | --- | --- |'
	];

	for (const result of results) {
		const httpStatus = result.httpStatus || 'none';
		lines.push(
			`| ${result.name} | ${result.ok ? 'pass' : 'FAIL'} | ${httpStatus} | ${result.bytes} | ` +
				`${(result.elapsedMs / 1000).toFixed(1)}s | ${result.detail} |`
		);
	}

	if (failed.length > 0) {
		lines.push('', '### What each failure costs', '');
		for (const result of failed) {
			lines.push(`- **${result.name}**: ${result.detail}. Carries ${result.carries}.`);
		}
	}

	lines.push('', '## Merged payload', '');
	if (merged.error) {
		lines.push(`FAILED: ${merged.error}`);
	} else {
		const live = merged.total - merged.noLiveData.length - merged.overAWeekOld.length;
		lines.push(
			`- ${merged.total} cards: ${live} live, ${merged.overAWeekOld.length} last-known but over a week old, ` +
				`${merged.noLiveData.length} with no live data`,
			`- Cards per source: ${JSON.stringify(merged.sources)}`,
			`- cachedAt: ${merged.cachedAt}`
		);
		if (merged.noLiveData.length > 0) {
			lines.push('', 'Fell through to a stale fallback card:', '');
			for (const name of merged.noLiveData) lines.push(`- ${name}`);
		}
	}

	lines.push(
		'',
		'## Verdict',
		'',
		failed.length === 0 && !merged.error
			? 'Every source served the markup the scraper needs.'
			: `${failed.length} of ${results.length} sources failed${merged.error ? ', and the merge failed' : ''}.`,
		''
	);
	return lines.join('\n');
}

const egressAddress = await findEgressAddress();
// Sequential, not parallel: the point is to look like the scraper, not to be fast.
const results = [];
for (const source of SOURCES) {
	const result = await probeSource(source);
	console.log(`${result.ok ? 'pass' : 'FAIL'}  ${result.name}: ${result.detail}`);
	results.push(result);
}

console.log('\nMerging into trail cards...');
const merged = await readMergedTrails();

const report = buildReport({ egressAddress, merged, results });
writeFileSync(REPORT_PATH, report);
console.log(`\n${report}`);

process.exit(results.some((result) => !result.ok) || merged.error ? 1 : 0);
