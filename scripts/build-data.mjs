// Scrapes once and writes public/trails.json, which Vite copies into dist. That
// file is how GitHub Pages serves live-ish conditions with no server: the hourly
// workflow runs this, builds, and publishes.
//
// Two things it has to get right that a plain "scrape and write" would not:
//
// 1. Last good data. server.mjs keeps a failed scrape from blanking the page by
//    serving its in-memory cache, which a fresh CI process does not have. The
//    previously committed trails.json is that cache, so when every source fails
//    this leaves it alone rather than publishing a page of empty placeholders.
// 2. Commit churn. cachedAt changes on every run, so committing whenever the
//    file differs would be a commit an hour forever. It reports whether the
//    trails themselves changed, and the workflow commits only then. The
//    published file is always the fresh one either way, so the page's "last
//    cache" time stays honest.
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { conditionsChanged } from '../lib/summary.mjs';
import { getTrailsPayload } from '../lib/trails.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUTPUT_PATH = path.join(ROOT, 'public', 'trails.json');

function readPrevious() {
	try {
		return JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
	} catch {
		return null;
	}
}

// The workflow reads this to decide whether to commit the file.
function reportChanged(changed) {
	if (process.env.GITHUB_OUTPUT) {
		writeFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`, { flag: 'a' });
	}
}

const previous = readPrevious();
const payload = await getTrailsPayload();
const { bsky, cambaHome, metroparks } = payload.sources;
const liveCardCount = payload.trails.filter((trail) => !trail.stale).length;

console.log(
	`Sources: metroparks=${metroparks} camba=${cambaHome} bsky=${bsky} trailforks=${payload.sources.trailforks} ` +
		`weather=${payload.sources.weather} trailheads`
);
console.log(`${payload.trails.length} cards, ${liveCardCount} of them live`);

// Every source that carries real trail status came back empty. Ray's is computed
// from its published schedule so it survives regardless, which is why the check
// is on the sources rather than on the card count.
if (metroparks === 0 && cambaHome === 0 && bsky === 0) {
	if (previous) {
		reportChanged(false);
		console.error(
			'\nEvery live source failed. Keeping the published trails.json from ' +
				`${new Date(previous.cachedAt).toISOString()} rather than publishing empty cards.\n` +
				'Nothing is deployed from this run, so the site keeps serving the last good data.\n'
		);
		process.exit(1);
	}
	console.warn('\nEvery live source failed and there is no previous file, so this publishes link-only cards.\n');
}

writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, '\t')}\n`);

// What counts as a change, and what is ignored as hourly noise, is spelled out
// in lib/summary.mjs.
const changed = conditionsChanged(previous?.trails, payload.trails);

reportChanged(changed);
console.log(changed ? 'Conditions changed since the last commit.' : 'Conditions unchanged; only timestamps moved.');
console.log(`Wrote ${OUTPUT_PATH}`);
