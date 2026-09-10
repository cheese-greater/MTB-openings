import { useEffect, useMemo, useState } from 'react';

import { useTimeAgo } from './timeAgo';
import TrailCard from './TrailCard';
import type { Trail } from './trailData';

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

function getInitialTheme(): Theme {
	const saved = localStorage.getItem('theme');
	if (saved === 'dracula' || saved === 'alucard') return saved;
	return window.matchMedia('(prefers-color-scheme: light)').matches ? 'alucard' : 'dracula';
}

function getInitialSort(): SortKey {
	const saved = localStorage.getItem('sort');
	if (saved === 'name' || saved === 'status' || saved === 'updated') return saved;
	return 'updated';
}

function getInitialFavorites(): Set<string> {
	try {
		const saved = JSON.parse(localStorage.getItem('favorites') ?? '[]') as unknown;
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

const SHARE_URL = 'https://joe-eager.github.io/MTB-openings/';

function App() {
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(true);
	const [trails, setTrails] = useState<Trail[]>([]);
	const [cachedAt, setCachedAt] = useState<number | null>(null);
	const [theme, setTheme] = useState<Theme>(getInitialTheme);
	const [sort, setSort] = useState<SortKey>(getInitialSort);
	const [favorites, setFavorites] = useState<Set<string>>(getInitialFavorites);
	const [favoritesFirst, setFavoritesFirst] = useState(() => localStorage.getItem('favoritesFirst') === 'true');
	const [shareOpen, setShareOpen] = useState(false);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		localStorage.setItem('theme', theme);
	}, [theme]);

	useEffect(() => {
		localStorage.setItem('sort', sort);
	}, [sort]);

	useEffect(() => {
		localStorage.setItem('favorites', JSON.stringify([...favorites]));
	}, [favorites]);

	useEffect(() => {
		localStorage.setItem('favoritesFirst', String(favoritesFirst));
	}, [favoritesFirst]);

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
		fetch(`${import.meta.env.BASE_URL}trails.json`)
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
			</footer>
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
