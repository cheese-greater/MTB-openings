import type { CSSProperties } from 'react';

// The confetti a dialog bursts into as it closes; each dot's angle, distance and color feed the keyframes in App.css.
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
