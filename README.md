# CLE MTB Trails

## 🚵 [Is the trail open?](https://cheese-greater.github.io/MTB-openings/)

Two dozen or so mountain bike trails around Cleveland on one page, so you know whether to load the bike before you drive an hour to find out.

Every trail gets a card: open, caution, closed, or greyed out when nobody has reported in a week. Tap one for the latest report in the trail crew's own words, directions, and a link to wherever that report came from.

The status comes from wherever each trail's people actually post: Cleveland Metroparks, CAMBA Trailmate, TrailForks, and the crews posting to Bluesky. Ray's is in there too, worked out from their published season calendar rather than guessed at. Each outdoor card also shows the sky and temperature at its trailhead right now, from OpenWeather, and links through to today's Foreca forecast for that spot. Star the trails you ride and they stay pinned to the top. Sort by what changed most recently, by status, or by name. Light or dark, whichever your phone already prefers.

It rescrapes and republishes itself every hour, so the page is never much further behind than the trail crews are. No app, no login, nothing to install.

MIT licensed. React and Vite, published free on GitHub Pages by a scheduled Action.

Running your own copy: the weather needs an OpenWeather API key. Copy `.env.example` to `.env` and fill in `OPENWEATHER_API_KEY` for a local or self-hosted copy, and add a repository secret of the same name for the Pages workflow. Everything else works without it; the cards just carry no weather.
