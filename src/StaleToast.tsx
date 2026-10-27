import { useEffect, useState } from 'react';

import { ageLabel, useNow } from './timeAgo';

// How long the notice stays up on its own: MUI's six seconds, with a little more for two sentences.
const AUTO_HIDE_MS = 8000;
// A hover or focus stops that clock; when it ends the notice stays half as long again, as MUI's snackbar does.
const RESUME_HIDE_MS = AUTO_HIDE_MS / 2;

// Where a reader sends word that the refresh keeps stalling: the issue tracker, as in the footer.
const ISSUES_URL = `${__REPO_URL__}/issues`;

// A snackbar in MUI's manner that pops up when the cached conditions are older than the hourly publish should
// ever leave them: GitHub skipped the refresh, or the app is offline on its last copy. Shown once per load.
function StaleToast({ cachedAt, open }: { cachedAt: number; open: boolean }) {
	const now = useNow();
	const [dismissed, setDismissed] = useState(false);
	// Closing plays the exit first and unmounts when that animation ends.
	const [closing, setClosing] = useState(false);
	// Null while a hover or focus holds the notice up.
	const [hideAfter, setHideAfter] = useState<number | null>(AUTO_HIDE_MS);
	const shown = open && !dismissed;

	useEffect(() => {
		if (!shown || closing || hideAfter == null) return;
		const timer = setTimeout(() => setClosing(true), hideAfter);
		return () => clearTimeout(timer);
	}, [shown, closing, hideAfter]);

	if (!shown) return null;
	return (
		<div className={`stale-toast${closing ? ' stale-toast--closing' : ''}`}>
			<div
				className='stale-toast__content'
				onBlur={() => setHideAfter(RESUME_HIDE_MS)}
				onFocus={() => setHideAfter(null)}
				onMouseEnter={() => setHideAfter(null)}
				onMouseLeave={() => setHideAfter(RESUME_HIDE_MS)}
				role='alert'
				onAnimationEnd={() => {
					if (!closing) return;
					setDismissed(true);
					setClosing(false);
				}}
			>
				{/* The caution triangle from the cards' status badge. */}
				<svg
					aria-hidden='true'
					className='stale-toast__icon'
					fill='none'
					stroke='currentColor'
					strokeLinecap='round'
					strokeLinejoin='round'
					strokeWidth='2'
					viewBox='0 0 24 24'
				>
					<path d='M12 4.5 21 20H3z' />
					<path d='M12 10.5v4M12 17.3v0.2' />
				</svg>
				<div className='stale-toast__message'>
					<strong className='stale-toast__title'>Hourly cache is {ageLabel(cachedAt, now)} old</strong>
					<p className='stale-toast__body'>
						If this keeps happening, please{' '}
						<a className='stale-toast__link' href={ISSUES_URL} rel='noopener noreferrer' target='_blank'>
							report it
						</a>
						.
					</p>
				</div>
				<button
					aria-label='Close'
					className='stale-toast__close'
					onClick={() => setClosing(true)}
					type='button'
				>
					<svg
						aria-hidden='true'
						fill='none'
						stroke='currentColor'
						strokeLinecap='round'
						strokeWidth='2'
						viewBox='0 0 24 24'
					>
						<path d='M6 6l12 12M18 6L6 18' />
					</svg>
				</button>
			</div>
		</div>
	);
}

export default StaleToast;
