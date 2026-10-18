import { useEffect, useRef } from 'react';

// Keeps one history entry for an open dialog, so back closes it instead of leaving the page.
export function useCloseOnBack(dialog: string, open: boolean, close: () => void): void {
	const closeRef = useRef(close);
	const entryRef = useRef(false);

	useEffect(() => {
		closeRef.current = close;
	});

	useEffect(() => {
		if (!open) {
			if (entryRef.current && window.history.state?.dialog === dialog) {
				entryRef.current = false;
				window.history.back();
			}
			return;
		}
		const ensureEntry = () => {
			if (document.visibilityState === 'hidden' || window.history.state?.dialog === dialog) return;
			window.history.pushState({ dialog }, '');
			entryRef.current = true;
		};
		if (!entryRef.current) ensureEntry();
		const onPopState = () => {
			entryRef.current = false;
			closeRef.current();
		};
		window.addEventListener('popstate', onPopState);
		document.addEventListener('visibilitychange', ensureEntry);
		window.addEventListener('pageshow', ensureEntry);
		return () => {
			window.removeEventListener('popstate', onPopState);
			document.removeEventListener('visibilitychange', ensureEntry);
			window.removeEventListener('pageshow', ensureEntry);
		};
	}, [open]);
}

// A page loaded onto a dialog's entry was reloaded or restored, so the dead entry is popped before render.
export function dropStaleDialogEntry(): void {
	if (typeof window.history.state?.dialog !== 'string' || window.history.length < 2) return;
	window.history.back();
}
