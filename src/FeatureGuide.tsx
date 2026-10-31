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
	"Ray's season calendar"
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
		body: "Tap a card's weather for the days around today: the three just gone, dimmed, with how much rain fell on each, then today and the next four as day and night, each with its chance of rain.",
		icon: <WeatherIcon className='guide-tile__icon' weather={{ condition: 'rain_showers', isDay: true }} />,
		title: 'Forecast'
	},
	{
		body: 'By what changed most recently, by status, or by name. The arrow beside it turns the order over, and the page remembers your pick.',
		icon: (
			<TileIcon>
				<path d='M4 6h10M4 12h7M4 18h4' />
				<path d='M18 5v14M14.5 15.5 18 19l3.5-3.5' />
			</TileIcon>
		),
		title: 'Sort'
	},
	{
		body: 'The star switch beside the sort keeps your starred trails pinned above everything else, whatever the sort.',
		icon: (
			<TileIcon filled>
				<path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' />
			</TileIcon>
		),
		title: 'Favorites first'
	},
	{
		body: 'Follows whichever your phone already prefers. The switch in the corner overrides it, and that sticks too.',
		icon: (
			<TileIcon>
				<circle cx='12' cy='12' r='9' />
				<path d='M12 3a9 9 0 0 1 0 18z' fill='currentColor' stroke='none' />
			</TileIcon>
		),
		title: 'Light or dark'
	},
	{
		body: 'The page rescrapes and republishes itself every hour. The footer says how old the last refresh is, and a notice pops up if it falls two hours behind.',
		icon: (
			<TileIcon>
				<circle cx='12' cy='12' r='9' />
				<path d='M12 7v5l3.5 2' />
			</TileIcon>
		),
		title: 'Hourly refresh'
	},
	{
		body: "No app store, no login. Add it to your home screen from the browser's menu: it opens like an app and keeps the last conditions it saw for a trailhead with no signal.",
		icon: (
			<TileIcon>
				<rect height='18' rx='3' width='12' x='6' y='3' />
				<path d='M12 8v6M9 11h6' />
			</TileIcon>
		),
		title: 'Add to home screen'
	},
	{
		body: 'The share button in the corner shows a QR code to scan and a link to copy, for the rider next to you.',
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
		body: 'On a desktop with a mouse, the paw print in the corner sends a dog running after your cursor. It stays home when your system asks for less motion.',
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
		body: 'On a phone, the back button closes whatever is open, this guide included, instead of leaving the page.',
		icon: (
			<TileIcon>
				<path d='M9 14l-4-4 4-4' />
				<path d='M5 10h9a5 5 0 0 1 0 10h-3' />
			</TileIcon>
		),
		title: 'Back closes'
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
					<p className='guide-dialog__subtitle'>Everything on this page, at a glance.</p>
				</header>

				<section className='guide-section'>
					<h3 className='guide-section__title'>Where the word comes from</h3>
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
							<span className='guide-flow__node-note'>scraped and republished</span>
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
							<span className='guide-flow__node-note'>never much further behind than the crews</span>
						</div>
					</div>
					<p className='guide-section__note'>
						Each status comes from wherever that trail&apos;s people actually post. Ray&apos;s is worked out
						from the published season calendar rather than guessed at.
					</p>
				</section>

				<section className='guide-section'>
					<h3 className='guide-section__title'>Reading a card</h3>
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
								<strong>Status.</strong> What the trail crew says: open, caution or closed, and grayed
								out once nobody has reported in a week. The chips at the top count them up.
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
								<strong>Star.</strong> Star the trails you ride. With the star switch in the header on,
								they stay pinned to the top.
							</div>
						</li>
						<li>
							<div className='guide-legend__text'>
								<strong>Directions.</strong> The trailhead lot, opened in your maps app.
							</div>
						</li>
						<li>
							<div className='guide-legend__text'>
								<strong>Weather now.</strong> The sky and temperature at that lot this hour. Tap it for
								the days around today.
							</div>
						</li>
						<li>
							<div className='guide-legend__text'>
								<strong>The report.</strong> The latest conditions in the crew&apos;s own words. On a
								desktop a long one folds to two lines; on a phone the whole card folds until you tap it.
							</div>
						</li>
						<li>
							<div className='guide-legend__text'>
								<strong>When, and where from.</strong> How long ago that report went up, and a link to
								the post or page it came from.
							</div>
						</li>
					</ol>
				</section>

				<section className='guide-section'>
					<h3 className='guide-section__title'>Around the page</h3>
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
					Free, open source and nothing to install. Wrong status, missing trail or dead link?{' '}
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
