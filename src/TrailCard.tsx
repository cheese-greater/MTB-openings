import { useLayoutEffect, useRef, useState } from 'react';

import { useMediaQuery } from './mediaQuery';
import { useTimeAgo } from './timeAgo';
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

interface Props {
	isFavorite: boolean;
	onToggleFavorite: (id: string) => void;
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

function TrailCard({ isFavorite, onToggleFavorite, trail }: Props) {
	const [expanded, setExpanded] = useState(false);
	const [conditionOpen, setConditionOpen] = useState(false);
	const [conditionOverflows, setConditionOverflows] = useState(false);
	const conditionRef = useRef<HTMLParagraphElement>(null);
	const isMobile = useMediaQuery(MOBILE_QUERY);
	const detailsId = `trail-details-${trail.id}`;
	const displayName = trail.name.replace('Ohio & Erie Canal', 'OECR');
	const updatedAgo = useTimeAgo(trail.timestamp);

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

	const summary = (
		<>
			<span className={`trail-card__badge trail-card__badge--${trail.stale ? 'stale' : trail.status}`}>
				{STATUS_LABEL[trail.status]}
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
						<a
							className='trail-card__weather'
							href={trail.weather.forecastUrl}
							rel='noopener noreferrer'
							target='_blank'
							title={`${trail.weather.description} at the trailhead as of the last hourly update (OpenWeather). Opens today's AccuWeather forecast.`}
						>
							<WeatherIcon className='trail-card__weather-icon' weather={trail.weather} />
							<span className='trail-card__weather-temp'>{`${trail.weather.temperature}°F`}</span>
						</a>
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
		</article>
	);
}

export default TrailCard;
