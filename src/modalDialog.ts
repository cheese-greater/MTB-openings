import { type MouseEvent, type SyntheticEvent, useEffect, useRef } from 'react';

// How long an exit gets before the dialog closes anyway, past the longest exit animation in App.css.
const EXIT_FALLBACK_MS = 750;

// A native modal that opens on mount and, once closing is set, plays its exit before closing for real.
export function useModalDialog(closing: boolean, onClose: () => void) {
	const dialogRef = useRef<HTMLDialogElement>(null);

	// Mounted only while open, so mounting is opening.
	useEffect(() => {
		dialogRef.current?.showModal();
	}, []);

	// The exit: close when the backdrop's fade has ended, with a timer as a fallback.
	useEffect(() => {
		const dialog = dialogRef.current;
		if (!closing || !dialog) return;
		const finish = () => dialog.close();
		const onAnimationEnd = (event: AnimationEvent) => {
			if (event.animationName === 'dialog-fade-out') finish();
		};
		dialog.addEventListener('animationend', onAnimationEnd);
		const timer = setTimeout(finish, EXIT_FALLBACK_MS);
		return () => {
			dialog.removeEventListener('animationend', onAnimationEnd);
			clearTimeout(timer);
		};
	}, [closing]);

	// Escape: the browser would close the dialog on the spot.
	const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
		event.preventDefault();
		onClose();
	};

	// A click on the backdrop lands on the dialog element itself.
	const onClick = (event: MouseEvent<HTMLDialogElement>) => {
		if (event.target === event.currentTarget) onClose();
	};

	return { dialogRef, onCancel, onClick };
}
