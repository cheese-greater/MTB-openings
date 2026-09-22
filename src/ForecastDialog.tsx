import { useEffect, useId, useRef } from 'react';

import type { ForecastPeriod, TrailWeather, WeatherConditions, WeatherDay } from './trailData';
import WeatherIcon from './WeatherIcon';

interface Props {
	onClose: () => void;
	place: string;
	title: string;
	weather: TrailWeather;
}

// A forecast period with the short label it gets under its day's heading.
interface ForecastRow extends ForecastPeriod {
	label: string;
}

// One calendar day of the dialog: a past day carries a single summary, today
// and the days ahead carry the rows that belong to them.
interface DayGroup {
	date: string;
	past?: WeatherDay;
	rows: ForecastRow[];
}

// Dates arrive as YYYY-MM-DD on the trailhead's Eastern calendar. Reading them
// at noon keeps the label on that date whatever clock the browser is on.
const atNoon = (date: string): Date => new Date(`${date}T12:00:00`);
const weekdayOf = (date: string): string => atNoon(date).toLocaleDateString('en-US', { weekday: 'long' });
const monthDayOf = (date: string): string =>
	atNoon(date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

const half = (period: ForecastPeriod): string => (period.isDay ? 'Day' : 'Night');

// Under a heading that already names the day, a period is just its half: Day
// or Night. The NWS's own names (Tuesday, Tuesday Night, This Afternoon,
// Tonight) would only repeat the heading. The exception is the small hours,
// when the night still under way and the night to come would both read Night,
// so the earlier keeps the NWS name: Overnight, or Tonight from a forecast
// issued before midnight.
const labelPeriods = (periods: ForecastPeriod[]): ForecastRow[] =>
	periods.map((period, index) => {
		const clash = periods
			.slice(index + 1)
			.some((later) => later.date === period.date && half(later) === half(period));
		return { ...period, label: clash ? period.name : half(period) };
	});

// Rainfall as a rider reads it, in hundredths of an inch.
const formatInches = (inches: number): string => `${inches.toFixed(2)} in`;

// The past days first, then every forecast period under the day it belongs
// to, in calendar order. Today reads Day and Night like any other day: the
// NWS daytime period is the Day row while one is still to come, and once the
// day is over the current hour stands in for it. While the NWS day period is
// there the current hour is not repeated; the card's chip already shows it.
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

// The weather behind a card's weather chip, one group per calendar day: the
// three days just gone, dimmed, with what fell on each; then today and the
// days ahead as the National Weather Service's day and night periods, each
// with its temperature and chance of precipitation.
// A native dialog opened modally, so the browser draws the backdrop, traps
// focus and closes on Escape.
function ForecastDialog({ onClose, place, title, weather }: Props) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const { forecastUrl, history, periods, ...current } = weather;
	const days = groupByDay(current, history, periods);

	// Mounted only while open, so mounting is opening. showModal on a dialog
	// that is already modal is a no-op, which is what StrictMode's second run
	// of this effect hits in development.
	useEffect(() => {
		dialogRef.current?.showModal();
	}, []);

	return (
		<dialog
			aria-labelledby={titleId}
			className='forecast-dialog'
			onClose={onClose}
			ref={dialogRef}
			onClick={(event) => {
				// A click on the backdrop lands on the dialog element itself; one
				// inside the panel has the panel or something in it as its target.
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
				{/* The source line doubles as the way out to the full forecast: the NWS
				    name links to weather.gov's page for this trailhead. Open-Meteo's data
				    is CC BY 4.0, which asks for credit and a link beside the data, a link
				    to the license, and a note that the data was changed: the daily rows
				    are its codes and readings summarized. */}
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
		</dialog>
	);
}

export default ForecastDialog;
