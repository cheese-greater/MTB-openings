export type TrailStatus = 'caution' | 'closed' | 'open' | 'stale';

export interface TrailLink {
	name: string;
	url: string;
}

// Current conditions at the trailhead when the payload was built, from
// OpenWeather: enough for an icon and a temperature, plus where to send a
// reader who wants the outlook.
export interface TrailWeather {
	code: number; // OpenWeather condition id, grouped by hundreds in WeatherIcon.tsx
	description: string;
	forecastUrl: string; // Foreca's forecast page (forecaweather.com) for the trailhead's locality
	isDay: boolean;
	temperature: number; // Fahrenheit
}

export interface Trail {
	condition: string;
	id: string;
	location: string;
	name: string;
	// The one page this card's report was pulled from: the Metroparks table, the
	// CAMBA trail page, the Bluesky post, the TrailForks region, or Ray's hours.
	// A card with no live data points at where its report would come from.
	source: TrailLink;
	stale: boolean;
	status: TrailStatus;
	timestamp: number | null;
	updatedAt: string;
	// Missing from payloads built before weather existed; null when the source
	// was down or the card has no trailhead coordinates (Ray's is indoors).
	weather?: TrailWeather | null;
}
