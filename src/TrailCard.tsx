import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import ForecastDialog from './ForecastDialog';
import { useMediaQuery } from './mediaQuery';
import { timeAgoCompact, useTimeAgo, useTimeAgoCompact } from './timeAgo';
import type { Trail } from './trailData';
import WeatherIcon from './WeatherIcon';

// Matches the mobile breakpoint in App.css. On mobile the whole card already
// collapses/expands on tap, so the condition clamp is desktop-only.
const MOBILE_QUERY = '(max-width: 768px)';

const STATUS_LABEL: Record<Trail['status'], string> = {
	caution: 'Caution',
	closed: 'Closed',
	open: 'Open',
	stale: 'Stale'
};

// What stands in for the status word on a collapsed phone card, each drawn on
// a 24px grid in the badge's own color: a thumbs up, a no-entry sign, a
// warning triangle, and a snore for a report nobody has refreshed. When the card
// opens the icon spins away and the word unrolls out of where it was (see
// .trail-card__badge-icon in App.css).
const STATUS_ICON: Record<Trail['status'], ReactNode> = {
	caution: (
		<>
			<path d='M12 4.5 21 20H3z' />
			<path d='M12 10.5v4M12 17.3v0.2' />
		</>
	),
	closed: (
		<>
			<circle cx='12' cy='12' r='8.5' />
			<path d='M8 12h8' />
		</>
	),
	open: (
		<path d='M7 11v10H4a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 4 11h3l3.5-8a2.5 2.5 0 0 1 2.5 2.5V10h4.6a2 2 0 0 1 2 2.3l-1.2 7a2 2 0 0 1-2 1.7H7' />
	),
	stale: <path d='M4 8.5h6.5L4 15.5h6.5M14 12.5h5.5L14 18.5h5.5' />
};

interface Props {
	isFavorite: boolean;
	onToggleFavorite: (id: string) => void;
	// When the card above this one was reported, or null at the top of the
	// list. On mobile the age column beside the list is labelled only where
	// the age changes, so a card labels itself when its age differs from its
	// neighbor's.
	previousTimestamp: number | null;
	trail: Trail;
}

function mapsUrl(trail: Trail): string {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trail.location)}`;
}

// Locations are stored as "<Plus Code> City, State". Hide the Plus Code in the
// card and show only the city/state; the Maps link still uses the full string.
function displayLocation(location: string): string {
	return location.replace(/^\s*\S*\+\S+,?\s*/, '').trim() || location;
}

function TrailCard({ isFavorite, onToggleFavorite, previousTimestamp, trail }: Props) {
	const [expanded, setExpanded] = useState(false);
	const [conditionOpen, setConditionOpen] = useState(false);
	const [conditionOverflows, setConditionOverflows] = useState(false);
	const [forecastOpen, setForecastOpen] = useState(false);
	const conditionRef = useRef<HTMLParagraphElement>(null);
	const isMobile = useMediaQuery(MOBILE_QUERY);
	const detailsId = `trail-details-${trail.id}`;
	const displayName = trail.name.replace('Ohio & Erie Canal', 'OECR');
	const updatedAgo = useTimeAgo(trail.timestamp);
	const updatedAgoCompact = useTimeAgoCompact(trail.timestamp);
	// The neighbor's age from the same render, so the two always agree on
	// which minute it is.
	const labelsAge = isMobile && updatedAgoCompact !== '' && updatedAgoCompact !== timeAgoCompact(previousTimestamp);

	// Detect whether the clamped condition overflows so we only show the toggle
	// when it's needed. Skip while expanded (the text is unclamped then, so it
	// wouldn't overflow) to preserve the previous reading and keep the toggle.
	const clamped = !isMobile && !conditionOpen;
	useLayoutEffect(() => {
		const el = conditionRef.current;
		if (isMobile || !el) {
			setConditionOverflows(false);
			return;
		}
		const measure = () => {
			if (conditionOpen) return;
			setConditionOverflows(el.scrollHeight - el.clientHeight > 1);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, [trail.condition, isMobile, conditionOpen]);

	const statusLabel = STATUS_LABEL[trail.status];
	const summary = (
		<>
			<span className={`trail-card__badge trail-card__badge--${trail.stale ? 'stale' : trail.status}`}>
				{isMobile ? (
					<>
						<span aria-hidden='true' className='trail-card__badge-icon'>
							<svg
								fill='none'
								stroke='currentColor'
								strokeLinecap='round'
								strokeLinejoin='round'
								strokeWidth='2.5'
								viewBox='0 0 24 24'
							>
								{STATUS_ICON[trail.status]}
							</svg>
						</span>
						<span className='trail-card__badge-text'>
							<span>{statusLabel}</span>
						</span>
					</>
				) : (
					statusLabel
				)}
			</span>
			<span className='trail-card__title'>{displayName}</span>
			<span aria-hidden='true' className='trail-card__chevron'>
				{'>'}
			</span>
		</>
	);

	return (
		<article
			className={`trail-card trail-card--${trail.stale ? 'stale' : trail.status}${
				isMobile && expanded ? ' is-expanded' : ''
			}`}
		>
			<div className='trail-card__head'>
				{/* The report's age, sitting on the line that runs down the left of
				    the list, level with this row. Hidden from assistive tech: a bare
				    "3d" means little read aloud, and the details carry the age in
				    full. */}
				{labelsAge && (
					<span aria-hidden='true' className='trail-card__age'>
						{updatedAgoCompact}
					</span>
				)}
				<h2 className='trail-card__name'>
					{isMobile ? (
						<button
							aria-controls={detailsId}
							aria-expanded={expanded}
							className='trail-card__summary'
							onClick={() => setExpanded((value) => !value)}
							type='button'
						>
							{summary}
						</button>
					) : (
						<span className='trail-card__summary'>{summary}</span>
					)}
				</h2>
				<button
					aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
					aria-pressed={isFavorite}
					className={`trail-card__fav${isFavorite ? ' is-active' : ''}`}
					onClick={() => onToggleFavorite(trail.id)}
					type='button'
				>
					<svg
						aria-hidden='true'
						className='trail-card__star'
						fill={isFavorite ? 'currentColor' : 'none'}
						stroke='currentColor'
						strokeLinejoin='round'
						strokeWidth='2'
						viewBox='0 0 24 24'
					>
						<path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' />
					</svg>
				</button>
			</div>
			<div className='trail-card__details' id={detailsId}>
				<div className='trail-card__place'>
					<a
						className='trail-card__location'
						href={mapsUrl(trail)}
						rel='noopener noreferrer'
						target='_blank'
						title={`Directions to ${displayLocation(trail.location)}`}
					>
						<svg
							aria-hidden='true'
							className='trail-card__location-icon'
							fill='currentColor'
							viewBox='0 0 24 24'
						>
							<path d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z' />
						</svg>
						<span className='trail-card__location-text'>{displayLocation(trail.location)}</span>
					</a>
					{trail.weather && (
						<button
							aria-haspopup='dialog'
							className='trail-card__weather'
							onClick={() => setForecastOpen(true)}
							title={trail.weather.description}
							type='button'
						>
							<WeatherIcon className='trail-card__weather-icon' weather={trail.weather} />
							<span className='trail-card__weather-temp'>{`${trail.weather.temperature}°F`}</span>
						</button>
					)}
				</div>
				<p
					onClick={!isMobile && conditionOverflows ? () => setConditionOpen((v) => !v) : undefined}
					ref={conditionRef}
					className={`trail-card__condition${clamped ? ' trail-card__condition--clamp' : ''}${
						!isMobile && conditionOverflows ? ' trail-card__condition--toggle' : ''
					}`}
				>
					{trail.condition}
				</p>
				{!isMobile && conditionOverflows && (
					<button
						aria-expanded={conditionOpen}
						className='trail-card__more'
						onClick={() => setConditionOpen((v) => !v)}
						type='button'
					>
						{conditionOpen ? 'Show less' : 'Show more'}
					</button>
				)}
				<div className='trail-card__foot'>
					{trail.timestamp != null && (
						<span className='trail-card__updated' title={trail.updatedAt}>
							{updatedAgo}
						</span>
					)}
					<div className='trail-card__source-row'>
						<a
							className='trail-card__source'
							href={trail.source.url}
							rel='noopener noreferrer'
							target='_blank'
							title='Where this report came from'
						>
							{trail.source.name}
							<svg
								aria-hidden='true'
								className='trail-card__source-icon'
								fill='currentColor'
								viewBox='0 0 24 24'
							>
								<path d='M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3m-2 16H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7z' />
							</svg>
						</a>
					</div>
				</div>
			</div>
			{forecastOpen && trail.weather && (
				<ForecastDialog
					onClose={() => setForecastOpen(false)}
					place={displayLocation(trail.location)}
					title={displayName}
					weather={trail.weather}
				/>
			)}
		</article>
	);
}

export default TrailCard;
