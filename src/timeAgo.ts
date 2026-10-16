import { useSyncExternalStore } from 'react';

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
// Each unit as a count of the one before it, with the abbreviation the compact
// form writes it as.
const DIVISIONS: [number, Intl.RelativeTimeFormatUnit, string][] = [
	[60, 'second', 's'],
	[60, 'minute', 'm'],
	[24, 'hour', 'h'],
	[7, 'day', 'd'],
	[4.34524, 'week', 'w'],
	[12, 'month', 'mo'],
	[Number.POSITIVE_INFINITY, 'year', 'y']
];

// "47 hours ago", matching the relative style the East Rim source already uses.
// Rounded before the unit is chosen, so 59.6 minutes reads as an hour and not
// as "60 minutes ago".
export function timeAgo(timestamp: number | null): string {
	if (timestamp == null) return '-';
	let duration = (timestamp - Date.now()) / 1000;
	for (const [amount, unit] of DIVISIONS) {
		if (Math.abs(Math.round(duration)) < amount) return RELATIVE.format(Math.round(duration), unit);
		duration /= amount;
	}
	return '-';
}

// "47h": the same age at its shortest, for the labels on the age column that
// runs beside the list on a phone, where "47 hours ago" would not fit. Anything
// under a minute, or a report stamped ahead of this clock, reads "now".
export function timeAgoCompact(timestamp: number | null): string {
	if (timestamp == null) return '';
	let duration = (Date.now() - timestamp) / 1000;
	if (duration < 60) return 'now';
	for (const [amount, , abbreviation] of DIVISIONS) {
		if (Math.round(duration) < amount) return `${Math.round(duration)}${abbreviation}`;
		duration /= amount;
	}
	return '';
}

// A single shared 30s ticker so every relative timestamp on the page advances
// together (and we don't spin up one interval per card).
const TICK_MS = 30_000;
const listeners = new Set<() => void>();
let tick = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void): () => void {
	listeners.add(onChange);
	if (timer === undefined) {
		timer = setInterval(() => {
			tick++;
			listeners.forEach((l) => l());
		}, TICK_MS);
	}
	return () => {
		listeners.delete(onChange);
		if (listeners.size === 0) {
			clearInterval(timer);
			timer = undefined;
		}
	};
}

const getTick = () => tick;

// Re-renders the caller on each shared tick, so a string it derives from
// Date.now() stays current without a manual refresh.
function useTick(): void {
	useSyncExternalStore(subscribe, getTick, getTick);
}

// Live version of timeAgo: the displayed "x minutes ago" keeps up on its own.
export function useTimeAgo(timestamp: number | null): string {
	useTick();
	return timeAgo(timestamp);
}

// Live version of timeAgoCompact, on the same ticker.
export function useTimeAgoCompact(timestamp: number | null): string {
	useTick();
	return timeAgoCompact(timestamp);
}
