import { type ReactNode, useId } from 'react';

import Burst from './Burst';
import { useModalDialog } from './modalDialog';
import WeatherIcon from './WeatherIcon';

import './FeatureGuide.css';

interface Props {
	// Set once a close is asked for: the dialog plays its exit, then closes and reports onClosed.
	closing: boolean;
	onClose: () => void;
	onClosed: () => void;
}

interface Feature {
	body: string;
	icon: ReactNode;
	title: string;
}

// Where a reader sends word of a wrong status, a missing trail or a dead link, as in the footer.
const ISSUES_URL = `${__REPO_URL__}/issues`;

// Where each card's word comes from, as the README lists them.
const SOURCES = [
	'Cleveland Metroparks',
	'CAMBA Trailmate',
	'TrailForks',
	'Trail crews on Bluesky',
	"Ray's season schedule"
];

// A line icon for a feature tile, on the 24px grid the header buttons use.
function TileIcon({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
	return (
		<svg
			aria-hidden='true'
			className='guide-tile__icon'
			fill={filled ? 'currentColor' : 'none'}
			stroke={filled ? 'none' : 'currentColor'}
			strokeLinecap='round'
			strokeLinejoin='round'
			strokeWidth='2'
			viewBox='0 0 24 24'
		>
			{children}
		</svg>
	);
}

// Everything on the page beyond the cards themselves, one tile each.
const FEATURES: Feature[] = [
	{
		body: "Tap a card's weather to see the last three days, with how much rain fell, and the next five days with the chance of rain. Handy for guessing how wet the trail is.",
		icon: <WeatherIcon className='guide-tile__icon' weather={{ condition: 'rain_showers', isDay: true }} />,
		title: 'Forecast'
	},
	{
		body: 'Sort the list by newest report, by status, or by name. The arrow button flips the order. Your choice is saved.',
		icon: (
			<TileIcon>
				<path d='M4 6h10M4 12h7M4 18h4' />
				<path d='M18 5v14M14.5 15.5 18 19l3.5-3.5' />
			</TileIcon>
		),
		title: 'Sort'
	},
	{
		body: 'Turn on the star switch and your starred trails always come first, whatever the sort.',
		icon: (
			<TileIcon filled>
				<path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' />
			</TileIcon>
		),
		title: 'Favorites first'
	},
	{
		body: "The page matches your phone's light or dark setting. The switch in the corner changes it, and that choice is saved.",
		icon: (
			<TileIcon>
				<circle cx='12' cy='12' r='9' />
				<path d='M12 3a9 9 0 0 1 0 18z' fill='currentColor' stroke='none' />
			</TileIcon>
		),
		title: 'Light or dark'
	},
	{
		body: 'The page updates itself every hour. The footer shows when it last updated. If it falls two hours behind, a notice pops up.',
		icon: (
			<TileIcon>
				<circle cx='12' cy='12' r='9' />
				<path d='M12 7v5l3.5 2' />
			</TileIcon>
		),
		title: 'Hourly refresh'
	},
	{
		body: "No app store and no login. Use your browser's menu to add the page to your home screen. It opens like an app and still shows the last conditions when you have no signal.",
		icon: (
			<TileIcon>
				<rect height='18' rx='3' width='12' x='6' y='3' />
				<path d='M12 8v6M9 11h6' />
			</TileIcon>
		),
		title: 'Add to home screen'
	},
	{
		body: 'The share button in the corner shows a QR code and a link you can copy, so you can pass the page to a friend.',
		icon: (
			<TileIcon>
				<circle cx='18' cy='5' r='3' />
				<circle cx='6' cy='12' r='3' />
				<circle cx='18' cy='19' r='3' />
				<path d='M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98' />
			</TileIcon>
		),
		title: 'Share'
	},
	{
		body: 'On a computer with a mouse, the paw print in the corner adds a dog that chases your cursor. Tap the paw to turn it off. It stays off if you have reduced motion turned on.',
		icon: (
			<TileIcon filled>
				<circle cx='6' cy='9.5' r='2.1' />
				<circle cx='10' cy='5.5' r='2.1' />
				<circle cx='14' cy='5.5' r='2.1' />
				<circle cx='18' cy='9.5' r='2.1' />
				<path d='M12 10.5c-3 0-6.2 3.2-6.2 5.8 0 1.7 1.3 2.7 2.8 2.7 1.3 0 2.2-.8 3.4-.8s2.1.8 3.4.8c1.5 0 2.8-1 2.8-2.7 0-2.6-3.2-5.8-6.2-5.8z' />
			</TileIcon>
		),
		title: 'Trail dog'
	},
	{
		body: 'On a phone, the back button closes any open window, like this one, instead of leaving the page.',
		icon: (
			<TileIcon>
				<path d='M9 14l-4-4 4-4' />
				<path d='M5 10h9a5 5 0 0 1 0 10h-3' />
			</TileIcon>
		),
		title: 'Back button'
	}
];

// A numbered callout on the sample card, matched by the legend beneath it.
function Mark({ number }: { number: number }) {
	return <span className='guide-mark'>{number}</span>;
}

// The arrow between two stops of the data flow; a phone turns it to point down.
function FlowArrow() {
	return (
		<svg
			aria-hidden='true'
			className='guide-flow__arrow'
			fill='none'
			stroke='currentColor'
			strokeLinecap='round'
			strokeLinejoin='round'
			strokeWidth='2'
			viewBox='0 0 24 24'
		>
			<path d='M4 12h15M13 6l6 6-6 6' />
		</svg>
	);
}

// An infographic of everything the page does, in a native modal dialog opened from the header.
function FeatureGuide({ closing, onClose, onClosed }: Props) {
	const { dialogRef, onCancel, onClick } = useModalDialog(closing, onClose);
	const titleId = useId();

	return (
		<dialog
			aria-labelledby={titleId}
			className={`guide-dialog${closing ? ' guide-dialog--closing' : ''}`}
			onCancel={onCancel}
			onClick={onClick}
			onClose={onClosed}
			ref={dialogRef}
		>
			<div className='guide-dialog__panel'>
				<header className='guide-dialog__head'>
					<button aria-label='Close' className='guide-dialog__close' onClick={onClose} type='button'>
						<svg aria-hidden='true' fill='currentColor' viewBox='0 0 24 24'>
							<path d='M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z' />
						</svg>
					</button>
					<h2 className='guide-dialog__title' id={titleId}>
						How it works
					</h2>
					<p className='guide-dialog__subtitle'>A quick tour of the page.</p>
				</header>

				<section className='guide-section'>
					<h3 className='guide-section__title'>Where the status comes from</h3>
					<div className='guide-flow'>
						<ul className='guide-flow__sources'>
							{SOURCES.map((source) => (
								<li className='guide-flow__source' key={source}>
									{source}
								</li>
							))}
						</ul>
						<FlowArrow />
						<div className='guide-flow__node'>
							<svg
								aria-hidden='true'
								className='guide-flow__node-icon'
								fill='none'
								stroke='currentColor'
								strokeLinecap='round'
								strokeLinejoin='round'
								strokeWidth='1.8'
								viewBox='0 0 24 24'
							>
								<circle cx='12' cy='12' r='9' />
								<path d='M12 7v5l3.5 2' />
							</svg>
							<span className='guide-flow__node-title'>Every hour</span>
							<span className='guide-flow__node-note'>the page checks every source</span>
						</div>
						<FlowArrow />
						<div className='guide-flow__node'>
							<svg
								aria-hidden='true'
								className='guide-flow__node-icon'
								fill='none'
								stroke='currentColor'
								strokeLinecap='round'
								strokeLinejoin='round'
								strokeWidth='1.8'
								viewBox='0 0 24 24'
							>
								<rect height='20' rx='3' width='14' x='5' y='2' />
								<path d='M8.5 7h7M8.5 11h7M8.5 15h4' />
							</svg>
							<span className='guide-flow__node-title'>This page</span>
							<span className='guide-flow__node-note'>updated within the hour</span>
						</div>
					</div>
					<p className='guide-section__note'>
						Each trail&apos;s status comes from the people who look after it, wherever they post. Ray&apos;s
						follows its published season schedule.
					</p>
				</section>

				<section className='guide-section'>
					<h3 className='guide-section__title'>What a card shows</h3>
					{/* Drawn as the real cards are; the legend says it all for a screen reader. */}
					<div aria-hidden='true' className='guide-card'>
						<div className='guide-card__head'>
							<span className='trail-card__badge trail-card__badge--open'>Open</span>
							<Mark number={1} />
							<span className='guide-card__title'>Royalview - Red Loop</span>
							<svg className='guide-card__star' fill='currentColor' viewBox='0 0 24 24'>
								<path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' />
							</svg>
							<Mark number={2} />
						</div>
						<div className='guide-card__place'>
							<span className='guide-card__location'>
								<svg className='guide-card__location-icon' fill='currentColor' viewBox='0 0 24 24'>
									<path d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z' />
								</svg>
								Strongsville, Ohio
								<Mark number={3} />
							</span>
							<span className='guide-card__weather'>
								<WeatherIcon
									className='guide-card__weather-icon'
									weather={{ condition: 'sct', isDay: true }}
								/>
								54°F
								<Mark number={4} />
							</span>
						</div>
						<p className='guide-card__condition'>
							Tacky and fast after yesterday&apos;s wind. Watch the roots on the north climb.
							<Mark number={5} />
						</p>
						<div className='guide-card__foot'>
							<span className='guide-card__updated'>
								2 hours ago
								<Mark number={6} />
							</span>
							<span className='guide-card__source'>
								Cleveland Metroparks
								<svg className='guide-card__source-icon' fill='currentColor' viewBox='0 0 24 24'>
									<path d='M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3m-2 16H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7z' />
								</svg>
							</span>
						</div>
					</div>
					<ol className='guide-legend'>
						<li>
							<div className='guide-legend__text'>
								<strong>Status.</strong> Open, caution or closed, as the trail crew reports it. A card
								turns gray when there has been no report for a week. The counts at the top add them up.
								<div className='guide-legend__badges'>
									<span className='trail-card__badge trail-card__badge--open'>Open</span>
									<span className='trail-card__badge trail-card__badge--caution'>Caution</span>
									<span className='trail-card__badge trail-card__badge--closed'>Closed</span>
									<span className='trail-card__badge trail-card__badge--stale'>Stale</span>
								</div>
							</div>
						</li>
						<li>
							<div className='guide-legend__text'>
								<strong>Star.</strong> Tap the star on the trails you ride. Turn on the star switch at
								the top and they stay at the top of the list.
							</div>
						</li>
						<li>
							<div className='guide-legend__text'>
								<strong>Directions.</strong> Tap the place name to open the trailhead in your maps app.
							</div>
						</li>
						<li>
							<div className='guide-legend__text'>
								<strong>Weather now.</strong> The sky and temperature at the trailhead right now. Tap it
								for the forecast.
							</div>
						</li>
						<li>
							<div className='guide-legend__text'>
								<strong>The report.</strong> The latest report, in the trail crew&apos;s own words. On a
								phone, tap a card to open it.
							</div>
						</li>
						<li>
							<div className='guide-legend__text'>
								<strong>When, and where from.</strong> How long ago the report was posted, and a link to
								where it came from.
							</div>
						</li>
					</ol>
				</section>

				<section className='guide-section'>
					<h3 className='guide-section__title'>Everything else</h3>
					<ul className='guide-tiles'>
						{FEATURES.map((feature) => (
							<li className='guide-tile' key={feature.title}>
								{feature.icon}
								<h4 className='guide-tile__title'>{feature.title}</h4>
								<p className='guide-tile__body'>{feature.body}</p>
							</li>
						))}
					</ul>
				</section>

				<p className='guide-dialog__credit'>
					Free and open source. Wrong status, missing trail or broken link?{' '}
					<a href={ISSUES_URL} rel='noopener noreferrer' target='_blank'>
						Open an issue
					</a>
					.
				</p>
			</div>
			{closing && <Burst />}
		</dialog>
	);
}

export default FeatureGuide;
