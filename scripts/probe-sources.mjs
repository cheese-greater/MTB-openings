// Source-health probe. It answers one question: is each live source actually
// serving the markup we parse, from wherever this happens to be running?
//
// It exists for the "scrape in CI, publish a static trails.json" plan. Bot
// blocking by IP range is the one thing that would sink that plan, and it rarely
// looks like an error: a challenge or geo-block page comes back as HTTP 200 with
// none of the markup the scraper needs. So each source is judged by the anchor
// server.mjs actually reads, not by the status code alone. server.mjs is then
// started for real and /api/trails is read, so the merged result is measured
// instead of inferred from the per-source checks.
//
// Run it at home and again in CI, then compare the two reports; the difference
// is the answer. Writes probe-report.md next to package.json and exits nonzero
// if any source failed.
//
// The URLs and selectors below mirror server.mjs, which exports nothing, so they
// cannot be imported yet. If the scraping ever moves to lib/trails.mjs, import
// them from there rather than keeping a second copy.
import * as cheerio from 'cheerio';
import { execFile, spawn } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPORT_PATH = path.join(ROOT, 'probe-report.md');

const SCRAPER_USER_AGENT = 'Mozilla/5.0 (compatible; CLE-MTB-Status/1.0)';
const CURL_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const REQUEST_TIMEOUT_MS = 10000;
// Not 3000: the real page is often already running there on a dev machine.
const SERVER_PORT = 4173;
const SERVER_BOOT_TIMEOUT_MS = 20000;
// The first /api/trails hit does the whole scrape with nothing cached.
const TRAILS_TIMEOUT_MS = 90000;

const BSKY_ACCOUNT_HANDLE = 'smpmountainbike.bsky.social';
const BSKY_FEED_URL =
	'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed' +
	`?actor=${BSKY_ACCOUNT_HANDLE}&limit=10&filter=posts_no_replies`;

const SOURCES = [
	{
		carries: 'Bedford, Ohio & Erie, Royalview, West Creek (9 cards after lot splits)',
		measure: (body) => {
			const rows = cheerio.load(body)('.loc-status-table tbody tr').length;
			return { detail: `${rows} rows in .loc-status-table`, ok: rows > 0 };
		},
		name: 'Cleveland Metroparks',
		transport: 'fetch',
		url: 'https://www.clevelandmetroparks.com/parks/visit/activities/mountain-biking/trail-status'
	},
	{
		carries: 'the 10 CAMBA-only cards, plus the fallback refresh for every tracked trail',
		measure: (body) => {
			const alerts = cheerio.load(body)('#TrailMate_alerts .t-Alert').length;
			return { detail: `${alerts} alerts in #TrailMate_alerts`, ok: alerts > 0 };
		},
		name: 'CAMBA Trailmate (home)',
		transport: 'fetch',
		url: 'https://dualrates.com/a/r/szz/camba/home'
	},
	{
		carries: 'CVNP East Rim (CAMBA home can cover for it)',
		measure: (body) => {
			const fields = cheerio.load(body)('.t-AVPList-label').length;
			return { detail: `${fields} .t-AVPList-label fields`, ok: fields > 0 };
		},
		name: 'CAMBA Trailmate (CVNP East Rim)',
		transport: 'fetch',
		url: 'https://camba.dualrates.com/a/r/szz/camba/trail?p6_id=103'
	},
	{
		carries: 'Austin Badger Park (already falls back to stale by design)',
		measure: (body) => {
			const $ = cheerio.load(body);
			const container = $('.grey')
				.filter((_, el) => $(el).text().trim() === 'Region Status')
				.first()
				.parent();
			const icons = container.find('.sicon_small').length;
			return { detail: `${icons} region-status icons`, ok: icons > 0 };
		},
		name: 'TrailForks (Austin Badger Park)',
		transport: 'curl',
		url: 'https://www.trailforks.com/region/austin-badger-park-17345/'
	},
	{
		carries: 'Hampton Hills',
		measure: (body) => {
			const posts = JSON.parse(body).feed?.length ?? 0;
			return { detail: `${posts} posts in the author feed`, ok: posts > 0 };
		},
		name: 'Bluesky (@smpmountainbike)',
		transport: 'fetch',
		url: BSKY_FEED_URL
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
// so server.mjs shells out to curl. Same call here, plus -w to recover the status
// code that curl otherwise keeps out of the body.
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

// Which address the request went out from. The whole point of running this in CI
// is to find out whether these sites treat GitHub's ranges differently, so the
// address belongs in the report. Best effort; never fatal.
async function findEgressAddress() {
	try {
		const response = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		return (await response.text()).trim();
	} catch {
		return 'unknown';
	}
}

function startServer() {
	const child = spawn(process.execPath, ['server.mjs'], {
		cwd: ROOT,
		env: { ...process.env, PORT: String(SERVER_PORT) },
		stdio: ['ignore', 'pipe', 'pipe']
	});

	let output = '';
	const collect = (chunk) => {
		output += chunk.toString();
	};
	child.stdout.on('data', collect);
	child.stderr.on('data', collect);

	const listening = new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => settle(new Error(`server.mjs was not listening after ${SERVER_BOOT_TIMEOUT_MS}ms`)),
			SERVER_BOOT_TIMEOUT_MS
		);
		const settle = (error) => {
			clearTimeout(timer);
			child.stdout.off('data', checkOutput);
			if (error) reject(error);
			else resolve();
		};
		const checkOutput = () => {
			if (output.includes(`localhost:${SERVER_PORT}`)) settle();
		};
		child.once('exit', (code) => settle(new Error(`server.mjs exited with code ${code}: ${output.trim()}`)));
		child.stdout.on('data', checkOutput);
		checkOutput();
	});

	return { child, listening, serverOutput: () => output.trim() };
}

// Start server.mjs untouched and read its own endpoint, so what gets measured is
// the code that would run in the workflow rather than a reimplementation of it.
async function readMergedTrails() {
	const server = startServer();
	try {
		await server.listening;
		const response = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/trails`, {
			signal: AbortSignal.timeout(TRAILS_TIMEOUT_MS)
		});
		if (!response.ok) throw new Error(`/api/trails returned HTTP ${response.status}`);
		const payload = await response.json();
		const trails = payload.trails ?? [];
		return {
			cachedAt: payload.cachedAt ? new Date(payload.cachedAt).toISOString() : 'not set',
			noLiveData: trails.filter((trail) => trail.status === 'stale').map((trail) => trail.name),
			overAWeekOld: trails.filter((trail) => trail.stale && trail.status !== 'stale').map((trail) => trail.name),
			serverOutput: server.serverOutput(),
			total: trails.length
		};
	} catch (error) {
		return { error: error.message, serverOutput: server.serverOutput() };
	} finally {
		server.child.kill();
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

	lines.push('', '## Merged output from /api/trails', '');
	if (merged.error) {
		lines.push(`FAILED: ${merged.error}`);
	} else {
		const live = merged.total - merged.noLiveData.length - merged.overAWeekOld.length;
		lines.push(
			`- ${merged.total} cards: ${live} live, ${merged.overAWeekOld.length} last-known but over a week old, ` +
				`${merged.noLiveData.length} with no live data`,
			`- cachedAt: ${merged.cachedAt}`
		);
		if (merged.noLiveData.length > 0) {
			lines.push('', 'Fell through to a stale fallback card:', '');
			for (const name of merged.noLiveData) lines.push(`- ${name}`);
		}
	}
	if (merged.serverOutput) {
		lines.push('', 'server.mjs said:', '', '```', merged.serverOutput, '```');
	}

	lines.push(
		'',
		'## Verdict',
		'',
		failed.length === 0 && !merged.error
			? 'Every source served the markup the scraper needs.'
			: `${failed.length} of ${results.length} sources failed${merged.error ? ', and /api/trails failed' : ''}.`,
		''
	);
	return lines.join('\n');
}

const egressAddress = await findEgressAddress();
// Sequential, not parallel: two of these hit the same host, and the point is to
// look like the scraper rather than to be fast.
const results = [];
for (const source of SOURCES) {
	const result = await probeSource(source);
	console.log(`${result.ok ? 'pass' : 'FAIL'}  ${result.name}: ${result.detail}`);
	results.push(result);
}

console.log('\nStarting server.mjs and reading /api/trails...');
const merged = await readMergedTrails();

const report = buildReport({ egressAddress, merged, results });
writeFileSync(REPORT_PATH, report);
console.log(`\n${report}`);
console.log(`Report written to ${REPORT_PATH}`);

process.exit(results.some((result) => !result.ok) || merged.error ? 1 : 0);
