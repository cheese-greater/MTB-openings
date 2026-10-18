import { useSyncExternalStore } from 'react';

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
// Each unit as a count of the one before it, with the compact abbreviation.
const DIVISIONS: [number, Intl.RelativeTimeFormatUnit, string][] = [
	[60, 'second', 's'],
	[60, 'minute', 'm'],
	[24, 'hour', 'h'],
	[7, 'day', 'd'],
	[4.34524, 'week', 'w'],
	[12, 'month', 'mo'],
	[Number.POSITIVE_INFINITY, 'year', 'y']
];

// "47 hours ago", rounded before the unit is chosen.
export function timeAgo(timestamp: number | null): string {
	if (timestamp == null) return '-';
	let duration = (timestamp - Date.now()) / 1000;
	for (const [amount, unit] of DIVISIONS) {
		if (Math.abs(Math.round(duration)) < amount) return RELATIVE.format(Math.round(duration), unit);
		duration /= amount;
	}
	return '-';
}

// "47h": the same age at its shortest, for the age column on a phone.
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

// A single shared 30s ticker so every relative timestamp advances together.
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

// Re-renders the caller on each shared tick.
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
