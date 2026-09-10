# Source probe report

- Ran: 2026-09-10T18:03:44.466Z
- Where: local machine
- Egress address: 70.240.147.137
- Node: v24.19.0

## Sources

| Source | Result | HTTP | Bytes | Time | What came back |
| --- | --- | --- | --- | --- | --- |
| Cleveland Metroparks | pass | 200 | 102205 | 0.2s | 7 rows in .loc-status-table |
| CAMBA Trailmate (home) | pass | 200 | 41129 | 0.3s | 21 alerts in #TrailMate_alerts |
| CAMBA Trailmate (CVNP East Rim) | FAIL | 200 | 41129 | 0.4s | 0 .t-AVPList-label fields |
| TrailForks (Austin Badger Park) | pass | 200 | 252510 | 0.5s | 1 region-status icons |
| Bluesky (@smpmountainbike) | pass | 200 | 10711 | 0.2s | 10 posts in the author feed |

### What each failure costs

- **CAMBA Trailmate (CVNP East Rim)**: 0 .t-AVPList-label fields. Carries CVNP East Rim (CAMBA home can cover for it).

## Merged output from /api/trails

- 23 cards: 15 live, 8 last-known but over a week old, 0 with no live data
- cachedAt: 2026-09-10T18:03:44.461Z

server.mjs said:

```
CLE MTB -> http://localhost:4173
```

## Verdict

1 of 5 sources failed.
