import type { TrailWeather } from './trailData';

type WeatherGlyph = 'clear-day' | 'clear-night' | 'cloudy' | 'fog' | 'partly-cloudy' | 'rain' | 'snow' | 'thunder';

interface Props {
	className?: string;
	weather: TrailWeather;
}

interface CloudProps {
	fill: string;
	transform?: string;
}

// OpenWeather condition ids group by hundreds: 2xx thunderstorm, 3xx drizzle,
// 5xx rain, 6xx snow, 7xx mist, haze and fog, 800 clear, 801 to 804 clouds by
// how much of the sky they cover.
function glyphFor({ code, isDay }: TrailWeather): WeatherGlyph {
	if (code >= 200 && code < 300) return 'thunder';
	if (code >= 300 && code < 600) return 'rain';
	if (code >= 600 && code < 700) return 'snow';
	if (code >= 700 && code < 800) return 'fog';
	if (code === 800) return isDay ? 'clear-day' : 'clear-night';
	if (code === 801 || code === 802) return 'partly-cloudy';
	return 'cloudy';
}

// A cloud as overlapping discs on a flat base, so one colour fills it as a
// single silhouette. Drawn to fill the 24x24 box; callers scale and shift it.
function Cloud({ fill, transform }: CloudProps) {
	return (
		<g fill={fill} transform={transform}>
			<circle cx='9.5' cy='12.5' r='5' />
			<circle cx='15' cy='11.5' r='4' />
			<circle cx='6' cy='15' r='3.5' />
			<circle cx='17.5' cy='15' r='3.5' />
			<rect height='5.5' width='11.5' x='6' y='13' />
		</g>
	);
}

// The theme's own palette, set per theme in index.css.
const SUN = 'var(--weather-sun)';
const SUN_RAYS = 'var(--weather-sun-rays)';
const MOON = 'var(--weather-moon)';
const CLOUD = 'var(--weather-cloud)';
const CLOUD_DARK = 'var(--weather-cloud-dark)';
const RAIN = 'var(--weather-rain)';
const SNOW = 'var(--weather-snow)';
const BOLT = 'var(--weather-bolt)';
const FOG = 'var(--weather-fog)';

// Filled, two-tone icons in Dracula's or Alucard's colours, so they read as a
// splash of weather rather than another grey glyph and still belong to the
// theme. Later shapes paint over earlier ones, which is how a cloud sits in
// front of the sun and a bolt in front of its cloud.
function WeatherIcon({ className, weather }: Props) {
	const glyph = glyphFor(weather);
	return (
		<svg aria-hidden='true' className={className} viewBox='0 0 24 24'>
			{glyph === 'clear-day' && (
				<>
					<path
						d='M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1'
						stroke={SUN_RAYS}
						strokeLinecap='round'
						strokeWidth='2'
					/>
					<circle cx='12' cy='12' fill={SUN} r='5' />
				</>
			)}
			{glyph === 'clear-night' && (
				<>
					<path d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' fill={MOON} />
					<circle cx='19.5' cy='4' fill={SUN} r='1.2' />
					<circle cx='22.5' cy='8.5' fill={SUN} r='0.9' />
				</>
			)}
			{glyph === 'partly-cloudy' && (
				<>
					<path
						d='M8 1v2M1 8h2M3.05 3.05l1.4 1.4M12.95 3.05l-1.4 1.4M3.05 12.95l1.4-1.4'
						stroke={SUN_RAYS}
						strokeLinecap='round'
						strokeWidth='1.8'
					/>
					<circle cx='8' cy='8' fill={SUN} r='3.6' />
					<Cloud fill={CLOUD} transform='translate(6.5 5.5) scale(0.74)' />
				</>
			)}
			{glyph === 'cloudy' && (
				<>
					<Cloud fill={CLOUD_DARK} transform='translate(6 1.5) scale(0.7)' />
					<Cloud fill={CLOUD} transform='translate(0 3.5) scale(0.95)' />
				</>
			)}
			{glyph === 'fog' && (
				<>
					<Cloud fill={CLOUD} transform='translate(1.5 -1.5) scale(0.88)' />
					<path d='M5 18.5h14M8 22h8' stroke={FOG} strokeLinecap='round' strokeWidth='2' />
				</>
			)}
			{glyph === 'rain' && (
				<>
					<Cloud fill={CLOUD} transform='translate(1.5 -2.5) scale(0.88)' />
					<path d='M8 17v4.5M12 18.5v4.5M16 17v4.5' stroke={RAIN} strokeLinecap='round' strokeWidth='2.2' />
				</>
			)}
			{glyph === 'snow' && (
				<>
					<Cloud fill={CLOUD} transform='translate(1.5 -2.5) scale(0.88)' />
					<g fill={SNOW}>
						<circle cx='8' cy='18' r='1.3' />
						<circle cx='12' cy='19.5' r='1.3' />
						<circle cx='16' cy='18' r='1.3' />
						<circle cx='10' cy='22.2' r='1.3' />
						<circle cx='14' cy='22.7' r='1.3' />
					</g>
				</>
			)}
			{glyph === 'thunder' && (
				<>
					<Cloud fill={CLOUD_DARK} transform='translate(1.5 -2.5) scale(0.88)' />
					<path d='M13.5 10 9 17.5h3.5L11 24l6-9h-3.5l1-5z' fill={BOLT} />
				</>
			)}
		</svg>
	);
}

export default WeatherIcon;
