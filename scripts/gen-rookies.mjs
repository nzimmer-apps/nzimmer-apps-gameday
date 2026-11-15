// Rebuild src/lib/rookies.json (this season's draft class) from ESPN's draft feed. That feed sends no CORS
// header, so the app can't load it in the browser. Run once a year after the draft:
//   curl -s "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/draft?season=2026" | node scripts/gen-rookies.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const d = JSON.parse(readFileSync(0, 'utf8'));
const picks = {};
for (const p of d.picks || []) {
  const id = p.athlete?.alternativeId; // the NFL athlete id used everywhere else
  if (!id) continue;
  picks[id] = { round: p.round, pick: p.pick, overall: p.overall, team: String(p.teamId ?? '') };
}
const out = { season: Number(d.year), picks };
writeFileSync(new URL('../src/lib/rookies.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`wrote ${Object.keys(picks).length} draft picks for ${out.season}`);
