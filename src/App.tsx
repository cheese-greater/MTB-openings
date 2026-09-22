import { useEffect, useMemo, useState } from 'react';

import { useMediaQuery } from './mediaQuery';
import { useTimeAgo } from './timeAgo';
import TrailCard from './TrailCard';
import type { Trail } from './trailData';
import TrailDog from './TrailDog';

import './App.css';

type Theme = 'dracula' | 'alucard';

type SortKey = 'name' | 'status' | 'updated';

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
	{ label: 'Recently updated', value: 'updated' },
	{ label: 'Status', value: 'status' },
	{ label: 'Name', value: 'name' }
];

// Status sort priority: open trails surface first, stale last.
const STATUS_ORDER: Record<Trail['status'], number> = {
	caution: 1,
	closed: 2,
	open: 0,
	stale: 3
};

// Accessing localStorage throws outright in a browser with site data blocked, and
// these run inside useState initializers, so an unguarded read takes the whole app
// down before it mounts. Going through these means such a browser loses the saved
// preference, not the page.
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

function getInitialFavorites(): Set<string> {
	try {
		const saved = JSON.parse(readStored('favorites') ?? '[]') as unknown;
		if (Array.isArray(saved)) return new Set(saved.filter((id): id is string => typeof id === 'string'));
	} catch {
		// ignore malformed storage
	}
	return new Set();
}

function compareTrails(a: Trail, b: Trail, sort: SortKey): number {
	switch (sort) {
		case 'name':
			return a.name.localeCompare(b.name);
		case 'updated':
			return (b.timestamp ?? 0) - (a.timestamp ?? 0);
		case 'status':
		default:
			// Fresh reports before stale ones, then by the reported status (so an
			// open-but-stale trail beats a stale-stale one), then most recently
			// posted first, then name.
			return (
				Number(a.stale) - Number(b.stale) ||
				STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
				(b.timestamp ?? 0) - (a.timestamp ?? 0) ||
				a.name.localeCompare(b.name)
			);
	}
}

// The published address from package.json's homepage, baked in by vite.config.ts.
// The QR code beside it is generated from the same field, so the two agree, and
// a self-hosted copy offers the public site rather than its own LAN address.
const SHARE_URL = __SITE_URL__;
// The repository, from package.json's repository field the same way, for the
// footer's issue tracker and source links.
const REPO_URL = __REPO_URL__;

function App() {
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(true);
	const [trails, setTrails] = useState<Trail[]>([]);
	const [cachedAt, setCachedAt] = useState<number | null>(null);
	const [theme, setTheme] = useState<Theme>(getInitialTheme);
	const [sort, setSort] = useState<SortKey>(getInitialSort);
	const [favorites, setFavorites] = useState<Set<string>>(getInitialFavorites);
	const [favoritesFirst, setFavoritesFirst] = useState(() => readStored('favoritesFirst') === 'true');
	const [shareOpen, setShareOpen] = useState(false);
	const [copied, setCopied] = useState(false);

	// The dog chases the mouse, so it only makes sense with one: a touch screen
	// has no cursor to follow (a laptop with a touchscreen still has a fine
	// primary pointer, so it keeps it). It also stays away when the reader has
	// asked the OS for less motion. Otherwise it is on until switched off.
	const hasFinePointer = useMediaQuery('(pointer: fine)');
	const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
	const trailDogAvailable = hasFinePointer && !prefersReducedMotion;
	const [trailDog, setTrailDog] = useState(() => readStored('trailDog') !== 'false');

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		writeStored('theme', theme);
	}, [theme]);

	useEffect(() => {
		writeStored('sort', sort);
	}, [sort]);

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

	// When favoritesFirst is on, favorites are pinned above everything else; the
	// chosen sort then orders within each group. Otherwise it's a plain sort.
	const sortedTrails = useMemo(() => {
		return [...trails].sort((a, b) => {
			if (favoritesFirst) {
				const favA = favorites.has(a.id);
				const favB = favorites.has(b.id);
				if (favA !== favB) return favA ? -1 : 1;
			}
			return compareTrails(a, b, sort);
		});
	}, [trails, favorites, favoritesFirst, sort]);

	useEffect(() => {
		// Relative to BASE_URL so it works both at the site root and under the
		// /MTB-openings/ path Pages serves from. On Pages this is the file the
		// hourly workflow published; run by server.mjs it is scraped on the spot.
		// Always revalidated: Pages caches it for ten minutes, and a copy from
		// before a deploy that changed its shape would otherwise meet the new app.
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
							<label className='sort-control'>
								<span className='sort-control__label'>Sort by</span>
								<select
									className='sort-control__select'
									onChange={(e) => setSort(e.target.value as SortKey)}
									value={sort}
								>
									{SORT_OPTIONS.map((opt) => (
										<option key={opt.value} value={opt.value}>
											{opt.label}
										</option>
									))}
								</select>
							</label>
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
					sortedTrails.map((trail) => (
						<TrailCard
							isFavorite={favorites.has(trail.id)}
							key={trail.id}
							onToggleFavorite={toggleFavorite}
							trail={trail}
						/>
					))}
			</main>
			<footer className='site-footer'>
				<p>v{__APP_VERSION__}</p>
				{cachedAt != null && <p>Last hourly cache: {cachedAgo}</p>}
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
			{shareOpen && (
				<div
					aria-label='Share this site'
					aria-modal='true'
					className='qr-modal'
					onClick={() => setShareOpen(false)}
					role='dialog'
				>
					<div className='qr-modal__panel' onClick={(e) => e.stopPropagation()}>
						<button
							aria-label='Close'
							className='qr-modal__close'
							onClick={() => setShareOpen(false)}
							type='button'
						>
							&times;
						</button>
						<h2 className='qr-modal__title'>Share this site</h2>
						<p className='qr-modal__subtitle'>Scan the code or copy the link</p>
						<img
							alt={`QR code linking to ${SHARE_URL}`}
							className='qr-modal__qr'
							src={`${import.meta.env.BASE_URL}site-qr.svg`}
						/>
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
				</div>
			)}
		</>
	);
}

export default App;
