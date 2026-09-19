import { useSyncExternalStore } from 'react';

// One matchMedia subscription per query, shared by every component that asks for
// it, in the same shape as the shared ticker in timeAgo.ts. Subscribing per
// component meant one MediaQueryList and one re-render per trail card for what
// is a single page-wide boolean.
interface QueryStore {
	getSnapshot: () => boolean;
	subscribe: (onChange: () => void) => () => void;
}

// Nothing matches before hydration, which is also what the hook reports if it is
// ever rendered somewhere without a window.
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

	// getSnapshot and subscribe keep a stable identity for the life of the query,
	// so useSyncExternalStore does not tear down the subscription on every render.
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
