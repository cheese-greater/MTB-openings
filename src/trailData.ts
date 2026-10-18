export type TrailStatus = 'caution' | 'closed' | 'open' | 'stale';

export interface TrailLink {
	name: string;
	url: string;
}

// One NWS forecast period, cut down to what a forecast dialog row shows.
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

// One past day at the trailhead, from Open-Meteo.
export interface WeatherDay {
	condition: string; // an NWS icon name, mapped from the day's WMO weather code
	date: string; // YYYY-MM-DD
	description: string; // "Showers"
	high: number; // Fahrenheit
	low: number; // Fahrenheit
	precipitation: number; // inches
}

// The weather at the trailhead when the payload was built.
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
	// The one page this card's report was pulled from.
	source: TrailLink;
	stale: boolean;
	status: TrailStatus;
	timestamp: number | null;
	updatedAt: string;
	// Missing from older payloads; null when the source was down or the card has no trailhead.
	weather?: TrailWeather | null;
}
