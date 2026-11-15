// Rebuild src/lib/teams.json from ESPN's team list (that endpoint sends no CORS header, so the app
// can't fetch it in the browser). Run when a team rebrands:
//   curl -s https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams | node scripts/gen-teams.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(0, 'utf8'));
const teams = raw.sports[0].leagues[0].teams
  .map(({ team: t }) => ({
    id: String(t.id),
    abbr: t.abbreviation,
    name: t.displayName,
    short: t.shortDisplayName || t.name,
    location: t.location,
    color: `#${t.color || '444444'}`,
    alt: `#${t.alternateColor || 'aaaaaa'}`,
    logo: (t.logos.find((l) => l.rel.includes('default')) || t.logos[0]).href,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(new URL('../src/lib/teams.json', import.meta.url), JSON.stringify(teams, null, 1) + '\n');
console.log(`wrote ${teams.length} teams`);
