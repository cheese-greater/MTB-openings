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

// "5 hours": the age as a plain duration, rounded the way timeAgo rounds.
export function ageLabel(timestamp: number, now: number): string {
	let duration = (now - timestamp) / 1000;
	for (const [amount, unit] of DIVISIONS) {
		if (Math.abs(Math.round(duration)) < amount) {
			return new Intl.NumberFormat('en', { style: 'unit', unit, unitDisplay: 'long' }).format(
				Math.round(duration)
			);
		}
		duration /= amount;
	}
	return '';
}

// A single shared 30s ticker so every relative timestamp advances together. The store's snapshot is the
// time of the last tick, so each tick is a new value and re-renders every subscriber.
const TICK_MS = 30_000;
const listeners = new Set<() => void>();
let tickedAt = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void): () => void {
	listeners.add(onChange);
	if (timer === undefined) {
		timer = setInterval(() => {
			tickedAt = Date.now();
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

const getTickedAt = () => tickedAt;

// Re-renders the caller on each shared tick.
function useTick(): void {
	useSyncExternalStore(subscribe, getTickedAt, getTickedAt);
}

// The time as of the last tick, for anything that holds an age against a limit.
export function useNow(): number {
	return useSyncExternalStore(subscribe, getTickedAt, getTickedAt);
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
