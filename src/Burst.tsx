import type { CSSProperties } from 'react';

// The confetti a dialog bursts into as it closes: a dozen dots sent out at even
// angles, to three distances so the ring is not too neat, in colors from the
// palette. Each carries its angle, distance and color as custom properties that
// the dialog-confetti keyframes in App.css read. The burst is fixed to the
// middle of the viewport, where both dialogs sit, so no box of theirs clips
// the flight.
const COLORS = [
	'var(--accent)',
	'var(--status-open)',
	'var(--weather-sun)',
	'var(--weather-rain)',
	'var(--status-caution)',
	'var(--weather-moon)'
];
const PARTICLES: CSSProperties[] = Array.from(
	{ length: 12 },
	(_, index) =>
		({
			'--angle': `${index * 30}deg`,
			'--color': COLORS[index % COLORS.length],
			'--distance': `${140 + (index % 3) * 35}px`
		}) as CSSProperties
);

function Burst() {
	return (
		<span aria-hidden='true' className='dialog-burst'>
			{PARTICLES.map((particle, index) => (
				<span key={index} style={particle} />
			))}
		</span>
	);
}

export default Burst;
