import { useSyncExternalStore } from 'react';

// One matchMedia subscription per query, shared by every component that asks for it.
interface QueryStore {
	getSnapshot: () => boolean;
	subscribe: (onChange: () => void) => () => void;
}

// Nothing matches before hydration or without a window.
const NEVER_MATCHES: QueryStore = {
	getSnapshot: () => false,
	subscribe: () => () => {}
};

const stores = new Map<string, QueryStore>();

function storeFor(query: string): QueryStore {
	if (typeof window === 'undefined') return NEVER_MATCHES;

	const existing = stores.get(query);
	if (existing) return existing;

	const listeners = new Set<() => void>();
	const mediaQueryList = window.matchMedia(query);
	let matches = mediaQueryList.matches;

	mediaQueryList.addEventListener('change', (event) => {
		matches = event.matches;
		listeners.forEach((listener) => listener());
	});

	// Stable identities, so useSyncExternalStore keeps the subscription across renders.
	const store: QueryStore = {
		getSnapshot: () => matches,
		subscribe: (onChange) => {
			listeners.add(onChange);
			return () => {
				listeners.delete(onChange);
			};
		}
	};
	stores.set(query, store);
	return store;
}

export function useMediaQuery(query: string): boolean {
	const store = storeFor(query);
	return useSyncExternalStore(store.subscribe, store.getSnapshot, NEVER_MATCHES.getSnapshot);
}
