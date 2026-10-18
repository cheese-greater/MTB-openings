import { useEffect, useId, useRef } from 'react';

import Burst from './Burst';
import type { ForecastPeriod, TrailWeather, WeatherConditions, WeatherDay } from './trailData';
import WeatherIcon from './WeatherIcon';

interface Props {
	// Set once a close is asked for: the dialog plays its exit, then closes and reports onClosed.
	closing: boolean;
	onClose: () => void;
	onClosed: () => void;
	place: string;
	title: string;
	weather: TrailWeather;
}

// A forecast period with the short label it gets under its day's heading.
interface ForecastRow extends ForecastPeriod {
	label: string;
}

// One calendar day of the dialog: a past day's summary or the forecast rows under it.
interface DayGroup {
	date: string;
	past?: WeatherDay;
	rows: ForecastRow[];
}

// Dates are YYYY-MM-DD on the Eastern calendar; reading them at noon keeps the label on that date.
const atNoon = (date: string): Date => new Date(`${date}T12:00:00`);
const weekdayOf = (date: string): string => atNoon(date).toLocaleDateString('en-US', { weekday: 'long' });
const monthDayOf = (date: string): string =>
	atNoon(date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

const half = (period: ForecastPeriod): string => (period.isDay ? 'Day' : 'Night');

// A period is Day or Night under its day's heading, unless a later period of the day would read the same.
const labelPeriods = (periods: ForecastPeriod[]): ForecastRow[] =>
	periods.map((period, index) => {
		const clash = periods
			.slice(index + 1)
			.some((later) => later.date === period.date && half(later) === half(period));
		return { ...period, label: clash ? period.name : half(period) };
	});

// Rainfall as a rider reads it, in hundredths of an inch.
const formatInches = (inches: number): string => `${inches.toFixed(2)} in`;

// Past days first, then every forecast period under its day, in calendar order.
function groupByDay(current: WeatherConditions, history: WeatherDay[], periods: ForecastPeriod[]): DayGroup[] {
	const groups = new Map<string, DayGroup>();
	for (const day of history) groups.set(day.date, { date: day.date, past: day, rows: [] });
	const dayStillAhead = periods.some((period) => period.date === current.date && period.isDay);
	const currentRow = dayStillAhead ? [] : [{ ...current, label: 'Day', name: 'Now' }];
	for (const row of [...currentRow, ...labelPeriods(periods)]) {
		const group = groups.get(row.date) ?? { date: row.date, rows: [] };
		group.rows.push(row);
		groups.set(row.date, group);
	}
	return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function Drop() {
	return (
		<svg aria-hidden='true' className='forecast-row__drop' fill='currentColor' viewBox='0 0 24 24'>
			<path d='M12 2.5c-3.6 5-7 8.9-7 12.9a7 7 0 0 0 14 0c0-4-3.4-7.9-7-12.9z' />
		</svg>
	);
}

// The weather behind a card's weather chip, grouped by calendar day, in a native modal dialog.
function ForecastDialog({ closing, onClose, onClosed, place, title, weather }: Props) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const { forecastUrl, history, periods, ...current } = weather;
	const days = groupByDay(current, history, periods);

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
		const timer = setTimeout(finish, 750);
		return () => {
			dialog.removeEventListener('animationend', onAnimationEnd);
			clearTimeout(timer);
		};
	}, [closing]);

	return (
		<dialog
			aria-labelledby={titleId}
			className={`forecast-dialog${closing ? ' forecast-dialog--closing' : ''}`}
			onClose={onClosed}
			ref={dialogRef}
			onCancel={(event) => {
				// Escape: the browser would close the dialog on the spot.
				event.preventDefault();
				onClose();
			}}
			onClick={(event) => {
				// A click on the backdrop lands on the dialog element itself.
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className='forecast-dialog__panel'>
				<header className='forecast-dialog__head'>
					<button aria-label='Close' className='forecast-dialog__close' onClick={onClose} type='button'>
						<svg aria-hidden='true' fill='currentColor' viewBox='0 0 24 24'>
							<path d='M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z' />
						</svg>
					</button>
					<h2 className='forecast-dialog__title' id={titleId}>
						{title}
					</h2>
					<p className='forecast-dialog__subtitle'>{place}</p>
				</header>
				<ol className='forecast-days'>
					{days.map((day) => {
						const isToday = day.date === current.date;
						const isPast = day.date < current.date;
						return (
							<li
								className={`forecast-day${isPast ? ' forecast-day--past' : ''}${isToday ? ' forecast-day--today' : ''}`}
								key={day.date}
							>
								<h3 className='forecast-day__heading'>
									<span className='forecast-day__weekday'>{weekdayOf(day.date)}</span>
									<span className='forecast-day__date'>{monthDayOf(day.date)}</span>
									{isToday && <span className='forecast-day__today'>Today</span>}
								</h3>
								<ul className='forecast-day__rows'>
									{day.past && (
										<li className='forecast-row'>
											<WeatherIcon
												className='forecast-row__icon'
												weather={{ condition: day.past.condition, isDay: true }}
											/>
											<span className='forecast-row__label'>{day.past.description}</span>
											<span className='forecast-row__temp' title='High and low'>
												<span className='forecast-row__high'>{`${day.past.high}°`}</span>/
												<span className='forecast-row__low'>{`${day.past.low}°`}</span>
											</span>
											<span className='forecast-row__precip' title='Rain and snow that fell'>
												<Drop />
												{formatInches(day.past.precipitation)}
											</span>
										</li>
									)}
									{day.rows.map((period) => (
										<li className='forecast-row' key={period.name}>
											<WeatherIcon className='forecast-row__icon' weather={period} />
											<span className='forecast-row__label'>{period.label}</span>
											<span className='forecast-row__description'>{period.description}</span>
											<span
												className={`forecast-row__temp forecast-row__temp--${period.label === 'Day' ? 'high' : 'low'}`}
											>
												{`${period.temperature}°`}
											</span>
											<span className='forecast-row__precip' title='Chance of precipitation'>
												<Drop />
												{`${period.precipitationChance}%`}
											</span>
										</li>
									))}
								</ul>
							</li>
						);
					})}
				</ol>
				{/* The source line doubles as the way out to the full forecast; Open-Meteo's CC BY 4.0 asks for credit. */}
				<p className='forecast-dialog__credit'>
					{'Forecast from the '}
					<a href={forecastUrl} rel='noopener noreferrer' target='_blank'>
						National Weather Service
					</a>
					.
					{history.length > 0 && (
						<>
							<br />
							{'Past days: '}
							<a href='https://open-meteo.com/' rel='noopener noreferrer' target='_blank'>
								Weather data by Open-Meteo.com
							</a>
							<br />
							{' ('}
							<a
								href='https://creativecommons.org/licenses/by/4.0/'
								rel='noopener noreferrer'
								target='_blank'
							>
								CC BY 4.0
							</a>
							), summarized to a daily condition, high, low and rainfall.
						</>
					)}
				</p>
			</div>
			{closing && <Burst />}
		</dialog>
	);
}

export default ForecastDialog;
