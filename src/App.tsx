import { useEffect, useMemo, useState } from 'react';

import Burst from './Burst';
import { isCacheStale } from './cacheAge';
import { useCloseOnBack } from './closeOnBack';
import { useMediaQuery } from './mediaQuery';
import StaleToast from './StaleToast';
import { useNow, useTimeAgo } from './timeAgo';
import TrailCard from './TrailCard';
import type { Trail } from './trailData';
import TrailDog from './TrailDog';

import './App.css';

type Theme = 'dracula' | 'alucard';

// Each theme's page background, for the browser chrome (theme-color meta).
const THEME_COLOR: Record<Theme, string> = {
	alucard: '#fffbeb',
	dracula: '#282a36'
};

type SortKey = 'name' | 'status' | 'updated';

type SortDirection = 'asc' | 'desc';

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
	{ label: 'Recently updated', value: 'updated' },
	{ label: 'Status', value: 'status' },
	{ label: 'Name', value: 'name' }
];

// Each sort's default direction and the words for either direction, for the direction button's tooltip.
const SORT_DIRECTIONS: Record<SortKey, { defaultDirection: SortDirection; orders: Record<SortDirection, string> }> = {
	name: { defaultDirection: 'asc', orders: { asc: 'A to Z', desc: 'Z to A' } },
	status: { defaultDirection: 'asc', orders: { asc: 'Open first', desc: 'Open last' } },
	updated: { defaultDirection: 'desc', orders: { asc: 'Oldest first', desc: 'Newest first' } }
};

// Status sort priority, ascending: open trails surface first, stale last.
const STATUS_ORDER: Record<Trail['status'], number> = {
	caution: 1,
	closed: 2,
	open: 0,
	stale: 3
};

// localStorage throws with site data blocked, so these guard the reads and writes.
function readStored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStored(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Storage blocked or full: the setting just will not survive a reload.
	}
}

function getInitialTheme(): Theme {
	const saved = readStored('theme');
	if (saved === 'dracula' || saved === 'alucard') return saved;
	return window.matchMedia('(prefers-color-scheme: light)').matches ? 'alucard' : 'dracula';
}

function getInitialSort(): SortKey {
	const saved = readStored('sort');
	if (saved === 'name' || saved === 'status' || saved === 'updated') return saved;
	return 'updated';
}

function getInitialSortDirection(sort: SortKey): SortDirection {
	const saved = readStored('sortDirection');
	if (saved === 'asc' || saved === 'desc') return saved;
	return SORT_DIRECTIONS[sort].defaultDirection;
}

function getInitialFavorites(): Set<string> {
	try {
		const saved = JSON.parse(readStored('favorites') ?? '[]') as unknown;
		if (Array.isArray(saved)) return new Set(saved.filter((id): id is string => typeof id === 'string'));
	} catch {
		// ignore malformed storage
	}
	return new Set();
}

// The ascending order of each sort, turned over whole for descending.
function compareTrails(a: Trail, b: Trail, sort: SortKey, direction: SortDirection): number {
	const sign = direction === 'asc' ? 1 : -1;
	switch (sort) {
		case 'name':
			return sign * a.name.localeCompare(b.name);
		case 'updated':
			return sign * ((a.timestamp ?? 0) - (b.timestamp ?? 0));
		case 'status':
		default:
			// Fresh before stale, then by status, then most recent, then name.
			return (
				sign *
				(Number(a.stale) - Number(b.stale) ||
					STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
					(b.timestamp ?? 0) - (a.timestamp ?? 0) ||
					a.name.localeCompare(b.name))
			);
	}
}

// The published address from package.json's homepage, baked in by vite.config.ts.
const SHARE_URL = __SITE_URL__;
// The repository address, for the footer's links.
const REPO_URL = __REPO_URL__;

function App() {
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(true);
	const [trails, setTrails] = useState<Trail[]>([]);
	const [cachedAt, setCachedAt] = useState<number | null>(null);
	const [theme, setTheme] = useState<Theme>(getInitialTheme);
	const [sort, setSort] = useState<SortKey>(getInitialSort);
	const [sortDirection, setSortDirection] = useState<SortDirection>(() => getInitialSortDirection(sort));
	const [favorites, setFavorites] = useState<Set<string>>(getInitialFavorites);
	const [favoritesFirst, setFavoritesFirst] = useState(() => readStored('favoritesFirst') === 'true');
	const [shareOpen, setShareOpen] = useState(false);
	// Closing the share dialog plays its exit first and unmounts when the backdrop's fade ends.
	const [shareClosing, setShareClosing] = useState(false);
	const closeShare = () => setShareClosing(true);
	// Open until the burst begins, so any close settles the history entry at once.
	useCloseOnBack('share', shareOpen && !shareClosing, closeShare);
	const [copied, setCopied] = useState(false);

	// The dog needs a mouse and a reader who has not asked for less motion.
	const hasFinePointer = useMediaQuery('(pointer: fine)');
	const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
	const trailDogAvailable = hasFinePointer && !prefersReducedMotion;
	const [trailDog, setTrailDog] = useState(() => readStored('trailDog') !== 'false');

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
		writeStored('theme', theme);
	}, [theme]);

	useEffect(() => {
		writeStored('sort', sort);
	}, [sort]);

	useEffect(() => {
		writeStored('sortDirection', sortDirection);
	}, [sortDirection]);

	useEffect(() => {
		writeStored('favorites', JSON.stringify([...favorites]));
	}, [favorites]);

	useEffect(() => {
		writeStored('favoritesFirst', String(favoritesFirst));
	}, [favoritesFirst]);

	useEffect(() => {
		writeStored('trailDog', String(trailDog));
	}, [trailDog]);

	const toggleFavorite = (id: string) =>
		setFavorites((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	// Favorites pin above everything when favoritesFirst is on; the chosen sort orders within each group.
	const sortedTrails = useMemo(() => {
		return [...trails].sort((a, b) => {
			if (favoritesFirst) {
				const favA = favorites.has(a.id);
				const favB = favorites.has(b.id);
				if (favA !== favB) return favA ? -1 : 1;
			}
			return compareTrails(a, b, sort, sortDirection);
		});
	}, [trails, favorites, favoritesFirst, sort, sortDirection]);

	useEffect(() => {
		// Relative to BASE_URL for the Pages path; always revalidated.
		fetch(`${import.meta.env.BASE_URL}trails.json`, { cache: 'no-cache' })
			.then((res) => {
				if (!res.ok) throw new Error();
				return res.json() as Promise<{ cachedAt: number; trails: Trail[] }>;
			})
			.then(({ cachedAt, trails }) => {
				setTrails(trails);
				setCachedAt(cachedAt);
			})
			.catch(() => setError(true))
			.finally(() => setLoading(false));
	}, []);

	const cachedAgo = useTimeAgo(cachedAt);
	const now = useNow();
	const cacheStale = cachedAt != null && isCacheStale(cachedAt, now);
	const cautionCount = trails.filter((t) => !t.stale && t.status === 'caution').length;
	const closedCount = trails.filter((t) => !t.stale && t.status === 'closed').length;
	const openCount = trails.filter((t) => !t.stale && t.status === 'open').length;

	return (
		<>
			<header className='site-header'>
				<div className='header-toggles'>
					{trailDogAvailable && (
						<button
							aria-label='Trail dog follows the cursor'
							aria-pressed={trailDog}
							className={`dog-button${trailDog ? ' is-active' : ''}`}
							onClick={() => setTrailDog((current) => !current)}
							type='button'
						>
							<svg
								aria-hidden='true'
								className='dog-button__icon'
								fill='currentColor'
								viewBox='0 0 24 24'
							>
								<circle cx='6' cy='9.5' r='2.1' />
								<circle cx='10' cy='5.5' r='2.1' />
								<circle cx='14' cy='5.5' r='2.1' />
								<circle cx='18' cy='9.5' r='2.1' />
								<path d='M12 10.5c-3 0-6.2 3.2-6.2 5.8 0 1.7 1.3 2.7 2.8 2.7 1.3 0 2.2-.8 3.4-.8s2.1.8 3.4.8c1.5 0 2.8-1 2.8-2.7 0-2.6-3.2-5.8-6.2-5.8z' />
							</svg>
						</button>
					)}
					<button
						aria-label='Show QR code and link'
						className='qr-button'
						type='button'
						onClick={() => {
							setCopied(false);
							setShareOpen(true);
						}}
					>
						<svg
							aria-hidden='true'
							className='qr-button__icon'
							fill='none'
							stroke='currentColor'
							strokeLinecap='round'
							strokeLinejoin='round'
							strokeWidth='2'
							viewBox='0 0 24 24'
						>
							<circle cx='18' cy='5' r='3' />
							<circle cx='6' cy='12' r='3' />
							<circle cx='18' cy='19' r='3' />
							<path d='M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98' />
						</svg>
					</button>
					<button
						aria-checked={theme === 'dracula'}
						aria-label='Dark theme'
						className='theme-toggle'
						onClick={() => setTheme((t) => (t === 'dracula' ? 'alucard' : 'dracula'))}
						role='switch'
						type='button'
					>
						<span className='theme-toggle__track'>
							<span className='theme-toggle__knob'>
								{theme === 'dracula' ? (
									<svg
										aria-hidden='true'
										className='theme-toggle__icon'
										fill='currentColor'
										viewBox='0 0 24 24'
									>
										<path d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' />
									</svg>
								) : (
									<svg
										aria-hidden='true'
										className='theme-toggle__icon'
										fill='none'
										stroke='currentColor'
										strokeLinecap='round'
										strokeWidth='2'
										viewBox='0 0 24 24'
									>
										<circle cx='12' cy='12' r='4' />
										<path d='M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' />
									</svg>
								)}
							</span>
						</span>
					</button>
				</div>
				<h1>CLE MTB Trails</h1>
				<p className='site-header__subtitle'>Trail conditions - Cleveland Metroparks</p>
				{!loading && !error && (
					<>
						<div className='site-header__summary'>
							<span className='summary-chip summary-chip--open'>{openCount} open</span>
							{cautionCount > 0 && (
								<span className='summary-chip summary-chip--caution'>{cautionCount} caution</span>
							)}
							<span className='summary-chip summary-chip--closed'>{closedCount} closed</span>
						</div>
						<div className='header-controls'>
							<div className='sort-control'>
								<label className='sort-control__field'>
									<span className='sort-control__label'>Sort by</span>
									<select
										className='sort-control__select'
										value={sort}
										onChange={(e) => {
											const next = e.target.value as SortKey;
											setSort(next);
											// A new sort starts in its default direction.
											setSortDirection(SORT_DIRECTIONS[next].defaultDirection);
										}}
									>
										{SORT_OPTIONS.map((opt) => (
											<option key={opt.value} value={opt.value}>
												{opt.label}
											</option>
										))}
									</select>
								</label>
								<button
									aria-label='Reverse sort order'
									className={`sort-direction sort-direction--${sortDirection}`}
									onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
									title={SORT_DIRECTIONS[sort].orders[sortDirection]}
									type='button'
								>
									<svg
										aria-hidden='true'
										className='sort-direction__icon'
										fill='none'
										stroke='currentColor'
										strokeLinecap='round'
										strokeLinejoin='round'
										strokeWidth='2'
										viewBox='0 0 24 24'
									>
										<path d='M4 6h10M4 12h7M4 18h4' />
										<path d='M18 5v14M14.5 15.5 18 19l3.5-3.5' />
									</svg>
								</button>
							</div>
							<button
								aria-checked={favoritesFirst}
								aria-label='Pin favorites to top'
								className='fav-toggle'
								onClick={() => setFavoritesFirst((v) => !v)}
								role='switch'
								type='button'
							>
								<span className='fav-toggle__track'>
									<span className='fav-toggle__knob'>
										<svg
											aria-hidden='true'
											className='fav-toggle__icon'
											fill={favoritesFirst ? 'currentColor' : 'none'}
											stroke='currentColor'
											strokeLinejoin='round'
											strokeWidth='2'
											viewBox='0 0 24 24'
										>
											<path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' />
										</svg>
									</span>
								</span>
							</button>
						</div>
					</>
				)}
			</header>
			<main className='trail-grid'>
				{loading && <p className='status-msg'>Loading trail conditions...</p>}
				{error && (
					<p className='status-msg status-msg--error'>
						Could not load trail conditions. Try again in a moment.
					</p>
				)}
				{!loading &&
					!error &&
					sortedTrails.map((trail, index) => (
						<TrailCard
							isFavorite={favorites.has(trail.id)}
							key={trail.id}
							onToggleFavorite={toggleFavorite}
							previousTimestamp={index > 0 ? sortedTrails[index - 1].timestamp : null}
							trail={trail}
						/>
					))}
			</main>
			<footer className='site-footer'>
				<p>v{__APP_VERSION__}</p>
				{cachedAt != null && (
					<p className={`site-footer__cache${cacheStale ? ' site-footer__cache--stale' : ''}`}>
						Last hourly cache: {cachedAgo}
					</p>
				)}
				<p className='site-footer__links'>
					<a href={`${REPO_URL}/issues`} rel='noopener noreferrer' target='_blank'>
						Report an issue
					</a>
					<a
						aria-label='Source on GitHub'
						className='site-footer__github'
						href={REPO_URL}
						rel='noopener noreferrer'
						target='_blank'
						title='Source on GitHub'
					>
						<svg aria-hidden='true' fill='currentColor' viewBox='0 0 16 16'>
							<path d='M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z' />
						</svg>
					</a>
				</p>
			</footer>
			{trailDogAvailable && trailDog && <TrailDog />}
			{cachedAt != null && <StaleToast cachedAt={cachedAt} open={cacheStale} />}
			{shareOpen && (
				<div
					aria-label='Share this site'
					aria-modal='true'
					className={`qr-modal${shareClosing ? ' qr-modal--closing' : ''}`}
					onClick={closeShare}
					role='dialog'
					onAnimationEnd={(event) => {
						// Only the backdrop's own fade, the longest, means the burst is over.
						if (!shareClosing || event.target !== event.currentTarget) return;
						setShareOpen(false);
						setShareClosing(false);
					}}
				>
					<div className='qr-modal__panel' onClick={(e) => e.stopPropagation()}>
						<button aria-label='Close' className='qr-modal__close' onClick={closeShare} type='button'>
							&times;
						</button>
						<h2 className='qr-modal__title'>Share this site</h2>
						<p className='qr-modal__subtitle'>Scan the code or copy the link</p>
						{/* The wrapper is what the scan beam sweeps across. */}
						<span className='qr-modal__scan'>
							<img
								alt={`QR code linking to ${SHARE_URL}`}
								className='qr-modal__qr'
								src={`${import.meta.env.BASE_URL}site-qr.svg`}
							/>
						</span>
						<div className='qr-modal__link'>
							<span className='qr-modal__url'>{SHARE_URL}</span>
							<button
								className='qr-modal__copy'
								type='button'
								onClick={() => {
									navigator.clipboard?.writeText(SHARE_URL).then(
										() => setCopied(true),
										() => setCopied(false)
									);
								}}
							>
								{copied ? 'Copied!' : 'Copy'}
							</button>
						</div>
					</div>
					{shareClosing && <Burst />}
				</div>
			)}
		</>
	);
}

export default App;
