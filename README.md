# SportsScoresbyZim

A personal NFL scores and stats app, built as an installable web app (PWA). It has live scores, box scores,
play-by-play by drive, team stats, win probability, standings, team pages, player pages and stat leaders.
Every team and player name is a link, and breadcrumbs (NFL › NFC › NFC North › Packers › Jordan Love)
take you back up.

It shows what Google's scoreboard leaves out, fumbles in particular:

- **Turnovers list on every game:** who fumbled, who forced it, who recovered it, and whether it was lost.
  Interceptions show the passer, the intended receiver and the defender.
- **Box score fumble table** (FUM / LOST / REC) and **total fumbles** in team stats next to fumbles lost.
- **Play filters:** scoring, turnovers, penalties, big plays (20+ yards).
- **Situational stats:** 3rd and 4th down, red zone, time of possession, penalties.
- Player career tables include forced fumbles (FF) and fumble recoveries (FR).
- **Award race:** projected MVP (DraftKings odds), Offensive and Defensive Player of the Year and both Rookie of the
  Year awards (stat-based scores, explained on the screen).
- **Quarter and half splits** on the Box score and Team stats tabs, rebuilt from the play-by-play
  (the "Game" view is ESPN's official box score).

Personal use only. Data comes from ESPN's public JSON feed, which is unofficial and can change. Not affiliated
with ESPN or the NFL.

## Install on a phone

Open the site in Chrome (Android) or Safari (iPhone), then use **Add to Home Screen**. It opens full screen
with its own icon, and the last scores you loaded stay available offline.

## Develop

```
npm ci
npm run dev      # http://localhost:5173
npm test         # turnover parser tests
npm run build    # typecheck + production build in dist/
```

## How it works

- React + TypeScript + Vite, `HashRouter` so every screen has a shareable link and the build works at any path.
- The phone calls ESPN directly (ESPN sends `Access-Control-Allow-Origin: *`); there is no server.
  The service worker keeps the last copy of each response for offline use.
- Live games refresh every 15 seconds while the app is on screen. Nothing polls in the background.
- `src/lib/turnovers.ts` reads fumble and interception details out of ESPN's play text. It's checked against
  ESPN's own "fumbles lost" totals; see the tests for the formats it handles.
- Team names, colors and logos ship in `src/lib/teams.json`, because ESPN's team list sends no CORS header.
  Regenerate with `curl -s https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams | node scripts/gen-teams.mjs`.

## Routes

| Link | Screen |
| --- | --- |
| `#/` | This week's scores, your teams first |
| `#/nfl/week/2026/2/3` | Any week (year / season type / week) |
| `#/nfl/game/<id>?tab=plays` | Game: summary, box, plays, stats, win % |
| `#/nfl` | Standings by division, conference or league |
| `#/nfl/nfc`, `#/nfl/nfc/north` | Conference and division |
| `#/nfl/team/gb?tab=roster` | Team: schedule, roster, stats, division |
| `#/nfl/player/<id>` | Player: game log, career |
| `#/nfl/leaders` | Stat leaders |
| `#/nfl/awards` | Award race |
| `#/settings` | My teams, theme |

Every link starts with `nfl/` so basketball can be added later under `nba/`.

## Deploy

`.github/workflows/pages.yml` tests, builds and deploys to GitHub Pages on every push to `main`.
One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
