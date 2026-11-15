# SportsScoresbyZim — notes for Claude

Personal NFL scores/stats PWA. React + TypeScript + Vite, deployed to GitHub Pages by `.github/workflows/pages.yml`
on push to `main`. Personal use only; data is ESPN's unofficial public JSON API (no key).

## Commands

`npm ci && npm test && npm run build` (`build` = `tsc --noEmit && vite build`). Dev: `npm run dev`.

## Rules

- All ESPN URLs live in `src/lib/espn.ts` (`urls`). Treat every response field as optional; shapes are undocumented.
- ESPN's `/teams` and `/teams/:id` endpoints send no CORS header, so the app never calls them: teams are bundled in
  `src/lib/teams.json` (regenerate with `scripts/gen-teams.mjs`) and records come from standings. Before using a new
  endpoint, check it with `curl -sD- -o/dev/null -H 'Origin: https://nzimmer-apps.github.io' <url>` for
  `access-control-allow-origin`.
- `src/lib/turnovers.ts` parses fumbles/interceptions from play text. Add a test in `turnovers.test.ts` with the
  real ESPN text for any new format. Its "lost" result should match the box score's `fumblesLost`.
- Quarter/half splits (`?split=q1`) are rebuilt from play-by-play in `src/lib/splits.ts`; "Game" always shows ESPN's
  official box score. After changing the parser, run `npx vite-node scripts/check-splits.mts <dir of summary JSONs>`
  (save some finished games with `curl .../summary?event=<id>`) and make sure match rates don't drop; add a test in
  `splits.test.ts` with the real play text for each new rule.
- Award race (`src/lib/awards.ts`, `#/nfl/awards`): MVP from ESPN's DraftKings futures, other awards from published
  scores over `statistics/byathlete` lists. Rookies come from bundled `src/lib/rookies.json`; regenerate it every year
  after the draft with `scripts/gen-rookies.mjs` (the draft feed has no CORS header). byathlete sort keys are
  case-sensitive and differ from the data: use `defensiveInterceptions.interceptions`.
- Every team or player name on screen should be a link (`TeamLink`, `PlayerLink`); tabs live in `?tab=`.
- Routes are prefixed `nfl/` so another league can be added alongside.

## Testing in a cloud sandbox

ESPN's CDN (Akamai) returns 403 to headless Chromium from data-center IPs, while curl works. To check screens with
Playwright, intercept `espn.com`/`espncdn.com` requests with `context.route` and fetch them with curl, passing ESPN's
real response headers through (never add a CORS header yourself, or CORS gaps stay hidden).
Real phones are not affected. Test by tapping through screens in one page, not only by loading each URL fresh:
bugs that only show on in-app navigation (e.g. an effect returning a non-function) are missed otherwise.
