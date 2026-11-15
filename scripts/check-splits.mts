// Compare play-by-play totals (src/lib/splits.ts) with ESPN's full-game box scores.
// Usage: npx vite-node scripts/check-splits.mts <dir of ESPN summary JSON files>
import { readdirSync, readFileSync } from 'node:fs';
import { buildBoxes, findLine, toPlayIn } from '../src/lib/splits';

const dir = process.argv[2];
const verbose = process.argv.includes('-v');
const tally: Record<string, [number, number]> = {};
const ok = (k: string, good: boolean, msg: string) => {
  (tally[k] ||= [0, 0])[good ? 0 : 1]++;
  if (!good && verbose) console.log(`  ✗ ${k}: ${msg}`);
};

for (const f of readdirSync(dir)) {
  const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  if (d.header?.competitions?.[0]?.status?.type?.state !== 'post') continue;
  const comps = d.header.competitions[0].competitors;
  const abbrOf = (id?: string) => comps.find((c: any) => c.team.id === String(id))?.team.abbreviation;
  const otherOf = (a?: string) => comps.find((c: any) => c.team.abbreviation !== a)?.team.abbreviation;
  const seen = new Set<string>();
  const plays = (d.drives?.previous || [])
    .flatMap((dr: any) => (dr.plays || []).map((p: any) => ({ ...p, _drive: dr })))
    .filter((p: any) => {
      const k = `${p.period?.number}|${p.clock?.displayValue}|${p.text}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((p: any) => toPlayIn(p, abbrOf, otherOf));
  const teams = comps.map((c: any) => c.team.abbreviation);
  const boxes = buildBoxes(plays, teams, 'all');
  if (verbose) console.log(f, teams.join(' v '));

  for (const tp of d.boxscore.players) {
    const ab = tp.team.abbreviation;
    const box = boxes[ab];
    const find = <T,>(m: Map<string, T>, a: any) => findLine(m, a);
    for (const cat of tp.statistics) {
      const L = cat.labels as string[];
      for (const row of cat.athletes) {
        const a = row.athlete;
        const v = (lab: string) => row.stats[L.indexOf(lab)];
        const who = `${ab} ${a.displayName}`;
        if (cat.name === 'passing') {
          const m = find(box.passing, a);
          const [c, at] = String(v('C/ATT')).split('/').map(Number);
          ok('pass C/ATT', !!m && m.comp === c && m.att === at, `${who} espn ${c}/${at} got ${m?.comp}/${m?.att}`);
          ok('pass YDS', !!m && m.yds === Number(v('YDS')), `${who} espn ${v('YDS')} got ${m?.yds}`);
          ok('pass TD', !!m && m.td === Number(v('TD')), `${who} espn ${v('TD')} got ${m?.td}`);
          ok('pass INT', !!m && m.int === Number(v('INT')), `${who} espn ${v('INT')} got ${m?.int}`);
          ok('pass SACKS', !!m && `${m.sacks}-${m.sackYds}` === v('SACKS'), `${who} espn ${v('SACKS')} got ${m?.sacks}-${m?.sackYds}`);
        }
        if (cat.name === 'rushing') {
          const m = find(box.rushing, a);
          ok('rush CAR', !!m && m.car === Number(v('CAR')), `${who} espn ${v('CAR')} got ${m?.car}`);
          ok('rush YDS', !!m && m.yds === Number(v('YDS')), `${who} espn ${v('YDS')} got ${m?.yds}`);
          ok('rush TD', !!m && m.td === Number(v('TD')), `${who} espn ${v('TD')} got ${m?.td}`);
        }
        if (cat.name === 'receiving') {
          const m = find(box.receiving, a);
          ok('rec REC', !!m && m.rec === Number(v('REC')), `${who} espn ${v('REC')} got ${m?.rec}`);
          ok('rec YDS', !!m && m.yds === Number(v('YDS')), `${who} espn ${v('YDS')} got ${m?.yds}`);
          ok('rec TD', !!m && m.td === Number(v('TD')), `${who} espn ${v('TD')} got ${m?.td}`);
          ok('rec TGTS', !!m && m.tgts === Number(v('TGTS')), `${who} espn ${v('TGTS')} got ${m?.tgts}`);
        }
        if (cat.name === 'fumbles') {
          const m = find(box.fumbles, a);
          ok('fum FUM', (m?.fum ?? 0) === Number(v('FUM')), `${who} espn ${v('FUM')} got ${m?.fum}`);
          ok('fum LOST', (m?.lost ?? 0) === Number(v('LOST')), `${who} espn ${v('LOST')} got ${m?.lost}`);
        }
        if (cat.name === 'defensive') {
          const m = find(box.defense, a);
          ok('def TOT', (m?.tot ?? 0) === Number(v('TOT')), `${who} espn ${v('TOT')} got ${m?.tot}`);
          ok('def SACKS', (m?.sacks ?? 0) === Number(v('SACKS')), `${who} espn ${v('SACKS')} got ${m?.sacks}`);
        }
        if (cat.name === 'interceptions') {
          const m = find(box.defense, a);
          ok('def INT', (m?.int ?? 0) === Number(v('INT')), `${who} espn ${v('INT')} got ${m?.int}`);
        }
        if (cat.name === 'kicking') {
          const m = find(box.kicking, a);
          const [fm, fa] = String(v('FG')).split('/').map(Number);
          const [xm, xa] = String(v('XP')).split('/').map(Number);
          ok('kick FG', !!m && m.fgm === fm && m.fga === fa, `${who} espn ${v('FG')} got ${m?.fgm}/${m?.fga}`);
          ok('kick XP', !!m && m.xpm === xm && m.xpa === xa, `${who} espn ${v('XP')} got ${m?.xpm}/${m?.xpa}`);
        }
        if (cat.name === 'punting') {
          const m = find(box.punting, a);
          ok('punt NO/YDS', !!m && m.no === Number(v('NO')) && m.yds === Number(String(v('YDS')).replace(',', '')), `${who} espn ${v('NO')}/${v('YDS')} got ${m?.no}/${m?.yds}`);
        }
        if (cat.name === 'kickReturns' || cat.name === 'puntReturns') {
          const m = find(cat.name === 'kickReturns' ? box.kickReturns : box.puntReturns, a);
          ok(`${cat.name} NO/YDS`, !!m && m.no === Number(v('NO')) && m.yds === Number(v('YDS')), `${who} espn ${v('NO')}/${v('YDS')} got ${m?.no}/${m?.yds}`);
        }
      }
    }
  }
  for (const tt of d.boxscore.teams) {
    const t = boxes[tt.team.abbreviation].totals;
    const s = (n: string) => tt.statistics.find((x: any) => x.name === n)?.displayValue;
    const who = tt.team.abbreviation;
    ok('team totalYards', t.yards === Number(s('totalYards')), `${who} espn ${s('totalYards')} got ${t.yards}`);
    ok('team netPassing', t.passYds === Number(s('netPassingYards')), `${who} espn ${s('netPassingYards')} got ${t.passYds}`);
    ok('team rushing', t.rushYds === Number(s('rushingYards')), `${who} espn ${s('rushingYards')} got ${t.rushYds}`);
    ok('team plays', t.plays === Number(s('totalOffensivePlays')), `${who} espn ${s('totalOffensivePlays')} got ${t.plays}`);
    ok('team 3rd down', `${t.thirdConv}-${t.thirdAtt}` === s('thirdDownEff'), `${who} espn ${s('thirdDownEff')} got ${t.thirdConv}-${t.thirdAtt}`);
    ok('team 4th down', `${t.fourthConv}-${t.fourthAtt}` === s('fourthDownEff'), `${who} espn ${s('fourthDownEff')} got ${t.fourthConv}-${t.fourthAtt}`);
    const fdNoPen = Number(s('firstDowns')) - Number(s('firstDownsPenalty'));
    ok('team 1st downs (non-penalty)', t.firstDowns === fdNoPen, `${who} espn ${fdNoPen} got ${t.firstDowns}`);
    ok('team penalties', `${t.penalties}-${t.penYds}` === s('totalPenaltiesYards'), `${who} espn ${s('totalPenaltiesYards')} got ${t.penalties}-${t.penYds}`);
    ok('team fumbles lost', t.fumLost === Number(s('fumblesLost')), `${who} espn ${s('fumblesLost')} got ${t.fumLost}`);
    ok('team INT thrown', t.int === Number(s('interceptions')), `${who} espn ${s('interceptions')} got ${t.int}`);
  }
}
const rows = Object.entries(tally).map(([k, [g, b]]) => `${(100 * g / (g + b)).toFixed(1).padStart(5)}%  ${String(b).padStart(3)} off of ${String(g + b).padStart(4)}  ${k}`);
console.log(rows.join('\n'));
