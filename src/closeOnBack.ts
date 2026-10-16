import { useEffect, useRef } from 'react';

// On a phone, and above all in the installed app, back should close an open
// dialog rather than leave the page. While a dialog is open this keeps one
// history entry for it: pressing back pops that entry, which closes the dialog,
// and closing it any other way (its button, the backdrop, Escape) pops the entry
// itself, so the history is left as the dialog found it. Whether the entry is
// on the stack is remembered across effect runs, so an effect run twice on one
// opening (development's strict mode does this) pushes once.
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
		if (!entryRef.current) {
			window.history.pushState({ dialog }, '');
			entryRef.current = true;
		}
		const onPopState = () => {
			entryRef.current = false;
			closeRef.current();
		};
		window.addEventListener('popstate', onPopState);
		return () => window.removeEventListener('popstate', onPopState);
	}, [open]);
}
