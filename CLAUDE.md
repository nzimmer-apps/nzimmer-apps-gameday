# SportsScoresbyZim — notes for Claude

Personal NFL scores/stats PWA. React + TypeScript + Vite, deployed to GitHub Pages by `.github/workflows/pages.yml`
on push to `main`. Personal use only; data is ESPN's unofficial public JSON API (no key).

## Commands

`npm ci && npm test && npm run build` (`build` = `tsc --noEmit && vite build`). Dev: `npm run dev`.

## Rules

- All ESPN URLs live in `src/lib/espn.ts` (`urls`). Treat every response field as optional; shapes are undocumented.
- ESPN's `/teams` endpoint has no CORS header, so teams are bundled in `src/lib/teams.json` (regenerate with
  `scripts/gen-teams.mjs`). Every other endpoint used sends `Access-Control-Allow-Origin: *`.
- `src/lib/turnovers.ts` parses fumbles/interceptions from play text. Add a test in `turnovers.test.ts` with the
  real ESPN text for any new format. Its "lost" result should match the box score's `fumblesLost`.
- Every team or player name on screen should be a link (`TeamLink`, `PlayerLink`); tabs live in `?tab=`.
- Routes are prefixed `nfl/` so another league can be added alongside.

## Testing in a cloud sandbox

ESPN's CDN (Akamai) returns 403 to headless Chromium from data-center IPs, while curl works. To check screens with
Playwright, intercept `espn.com`/`espncdn.com` requests with `context.route` and fetch them with curl.
Real phones are not affected.
