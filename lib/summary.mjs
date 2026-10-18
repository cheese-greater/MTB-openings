// What build-data.mjs compares between the committed trails.json and a fresh scrape, ignoring hourly noise.
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

// True when a reader would notice a difference between the two sets of cards.
export const conditionsChanged = (previousTrails, currentTrails) =>
	summarizeTrails(previousTrails) !== summarizeTrails(currentTrails);
