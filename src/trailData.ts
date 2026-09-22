export type TrailStatus = 'caution' | 'closed' | 'open' | 'stale';

export interface TrailLink {
	name: string;
	url: string;
}

// One forecast period as the National Weather Service issues them, day or
// night, cut down to what a row of the forecast dialog shows.
export interface WeatherConditions {
	condition: string; // the NWS icon name (skc, sct, bkn, rain_showers, tsra...), grouped into glyphs in WeatherIcon.tsx
	date: string; // YYYY-MM-DD, the Eastern calendar day the dialog files it under
	description: string; // the short forecast, "Chance Rain Showers"
	isDay: boolean;
	precipitationChance: number; // percent
	temperature: number; // Fahrenheit: a high by day, a low by night, the reading itself for the current hour
}

export interface ForecastPeriod extends WeatherConditions {
	name: string; // "Tonight", "Tuesday", "Tuesday Night"
}

// One past day at the trailhead, from Open-Meteo: what the day was like and
// how much fell, which is what the trail is still feeling.
export interface WeatherDay {
	condition: string; // an NWS icon name, mapped from the day's WMO weather code
	date: string; // YYYY-MM-DD
	description: string; // "Showers"
	high: number; // Fahrenheit
	low: number; // Fahrenheit
	precipitation: number; // inches
}

// The weather at the trailhead when the payload was built: the current hour
// for the card's icon and reading, and for the dialog behind it the three days
// before today, the day and night periods of the next five days from the
// National Weather Service, and where to send a reader who wants the whole
// forecast.
export interface TrailWeather extends WeatherConditions {
	forecastUrl: string; // weather.gov's point forecast page for the trailhead
	history: WeatherDay[]; // oldest first; empty when the source was down
	periods: ForecastPeriod[];
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
