# CLE MTB Trails

## 🚵 [Is the trail open?](https://cheese-greater.github.io/MTB-openings/)

Two dozen or so mountain bike trails around Cleveland on one page, so you know whether to load the bike before you drive an hour to find out.

Every trail gets a card: open, caution, closed, or grayed out when nobody has reported in a week. Tap one for the latest report in the trail crew's own words, directions, and a link to wherever that report came from.

The status comes from wherever each trail's people actually post: Cleveland Metroparks, CAMBA Trailmate, TrailForks, and the crews posting to Bluesky. Ray's is in there too, worked out from their published season calendar rather than guessed at. Each outdoor card also shows the sky and temperature at its trailhead right now. Tap that for the weather, grouped by day: the three days just gone, dimmed, with how much rain fell on each, then today and the next four days as day and night, each with its temperature and chance of rain. Enough to tell how wet the ground is and whether it will dry before you get there. Star the trails you ride and they stay pinned to the top. Sort by what changed most recently, by status, or by name. Light or dark, whichever your phone already prefers.

It rescrapes and republishes itself every hour, so the page is never much further behind than the trail crews are. No app, no login, nothing to install.

Spotted a wrong status, a missing trail or a dead link? [Open an issue](https://github.com/cheese-greater/MTB-openings/issues).

MIT licensed. React and Vite, published free on GitHub Pages by a scheduled Action. Running your own copy needs no keys or secrets: every source, the weather included, is public.

The forecast is the National Weather Service's, which is public domain and not subject to copyright. The past days are [weather data by Open-Meteo.com](https://open-meteo.com/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), summarized to a daily condition, high, low and rainfall. That summary is what the hourly commit of `public/trails.json` carries.
