// What scripts/build-data.mjs compares between the previously committed
// trails.json and a fresh scrape to decide whether conditions changed, and so
// whether the workflow commits the file.
//
// Not a whole-file comparison: CAMBA reports "6 hours ago", which gets resolved
// against the clock, so timestamp and updatedAt move on every single scrape and
// every run would look like a change. Everything else counts, including name,
// location and source; projecting only the status fields meant a corrected link
// was written but never committed, so the published file kept the old one.
// Order does not count either. The payload is in source order, and CAMBA lists
// its trails newest-post-first, so a trail reposting the same text would
// otherwise register as a change just by moving up the list. Weather is left
// out too: it moves every hour by nature, and a commit an hour for the
// temperature is the churn this exists to avoid. The published file still
// carries the fresh reading either way.
const VOLATILE_FIELDS = new Set(['timestamp', 'updatedAt', 'weather']);

export function summarizeTrails(trails) {
	if (!trails) return null;
	return JSON.stringify(
		trails
			.toSorted((a, b) => a.id.localeCompare(b.id))
			.map((trail) =>
				Object.keys(trail)
					.filter((field) => !VOLATILE_FIELDS.has(field))
					.sort()
					.map((field) => [field, trail[field]])
			)
	);
}

// True when a reader would notice a difference between the two sets of cards,
// including when there was no previous file at all.
export const conditionsChanged = (previousTrails, currentTrails) =>
	summarizeTrails(previousTrails) !== summarizeTrails(currentTrails);
