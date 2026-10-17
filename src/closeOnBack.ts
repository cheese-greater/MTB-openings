import { useEffect, useRef } from 'react';

// On a phone, and above all in the installed app, back should close an open
// dialog rather than leave the page. While a dialog is open this keeps one
// history entry for it: pressing back pops that entry, which closes the dialog,
// and closing it any other way (its button, the backdrop, Escape) pops the entry
// itself, so the history is left as the dialog found it. Whether the entry is
// on the stack is remembered across effect runs, so an effect run twice on one
// opening (development's strict mode does this) pushes once.
// The entry is checked again whenever the page comes back into view, since a
// browser that has had the installed app in the background can bring it back
// with the dialog still open but its entry gone, and back would then leave the
// app. If the entry is missing it is pushed again.
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

// A page that starts out on a dialog's entry did not open that dialog: it was
// reloaded or restored while one was open. Android does this to the installed
// app as a matter of course, dropping its renderer in the background and
// loading the current entry again on return; a deploy reloads it too. The
// dialog is gone and its entry has to go with it, or the first press of back
// would only pop the dead entry, with nothing to show for it or with a second
// load of the page, and the second press would be the one to leave. Popping it
// here, before the page renders, leaves back as the dialog found it. After a
// restore the entry below is this same document and the pop is a silent
// popstate; after a reload it is another document, and the pop loads the page
// once more, now on the right entry.
export function dropStaleDialogEntry(): void {
	if (typeof window.history.state?.dialog !== 'string' || window.history.length < 2) return;
	window.history.back();
}
