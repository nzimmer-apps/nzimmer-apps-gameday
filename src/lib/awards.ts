// Projected award races. MVP uses sportsbook odds (ESPN's DraftKings futures); the other awards are
// ranked by a simple, published score from season stats so it's clear why someone is on top.

import ROOKIES from './rookies.json';

export type Athlete = {
  id: string;
  name: string;
  short: string;
  pos: string;
  teamId?: string;
  headshot?: string;
  stats: Record<string, number>; // "passing.passingYards" → 2618
};

/** Flatten one ESPN statistics/byathlete response into Athletes. */
export function readByAthlete(d: any): Athlete[] {
  const cats: any[] = d?.categories || [];
  return (d?.athletes || []).map((row: any) => {
    const a = row.athlete || {};
    const stats: Record<string, number> = {};
    for (const c of row.categories || []) {
      const def = cats.find((x) => x.name === c.name);
      const names: string[] = def?.names || [];
      (c.totals || []).forEach((v: string, i: number) => {
        const n = Number(String(v).replace(/,/g, ''));
        if (names[i] && !Number.isNaN(n)) stats[`${c.name}.${names[i]}`] = n;
      });
    }
    return {
      id: String(a.id),
      name: a.displayName,
      short: a.shortName || a.displayName,
      pos: a.position?.abbreviation || '',
      teamId: a.teamId ? String(a.teamId) : undefined,
      headshot: a.headshot?.href,
      stats,
    };
  });
}

/** Merge lists (the same player can be in several), keeping the first copy. */
export function mergeAthletes(...lists: Athlete[][]): Athlete[] {
  const seen = new Map<string, Athlete>();
  for (const l of lists) for (const a of l) if (!seen.has(a.id)) seen.set(a.id, a);
  return [...seen.values()];
}

const s = (a: Athlete, k: string) => a.stats[k] || 0;

/**
 * Offense score, fantasy-style (half-PPR): 1 pt per 25 passing yards, 4 per passing TD, -2 per INT,
 * 1 per 10 rushing/receiving yards, 6 per rushing/receiving TD, 0.5 per catch, -2 per fumble lost.
 */
export function offenseScore(a: Athlete): number {
  return (
    s(a, 'passing.passingYards') / 25 +
    s(a, 'passing.passingTouchdowns') * 4 -
    s(a, 'passing.interceptions') * 2 +
    s(a, 'rushing.rushingYards') / 10 +
    s(a, 'rushing.rushingTouchdowns') * 6 +
    s(a, 'receiving.receivingYards') / 10 +
    s(a, 'receiving.receivingTouchdowns') * 6 +
    s(a, 'receiving.receptions') * 0.5 -
    (s(a, 'rushing.rushingFumblesLost') + s(a, 'receiving.receivingFumblesLost')) * 2
  );
}

/**
 * Defense score: 4 per sack, 5 per interception, 4 per forced fumble, 2 per fumble recovery,
 * 6 per defensive TD, 1 per tackle for loss, 1 per pass defended, 0.2 per tackle.
 */
export function defenseScore(a: Athlete): number {
  return (
    s(a, 'defensive.sacks') * 4 +
    s(a, 'defensiveinterceptions.interceptions') * 5 +
    s(a, 'general.fumblesForced') * 4 +
    s(a, 'general.fumblesRecovered') * 2 +
    (s(a, 'defensiveinterceptions.interceptionTouchdowns') + s(a, 'general.fumblesTouchdowns')) * 6 +
    s(a, 'defensive.tacklesForLoss') +
    s(a, 'defensive.passesDefended') +
    s(a, 'defensive.totalTackles') * 0.2
  );
}

export type Rookie = { round: number; pick: number; overall: number; team: string };
export const rookieSeason: number = ROOKIES.season;
export function rookieInfo(id: string): Rookie | undefined {
  return (ROOKIES.picks as Record<string, Rookie>)[id];
}

export type Ranked = { a: Athlete; score: number };

export function rank(list: Athlete[], score: (a: Athlete) => number, keep: (a: Athlete) => boolean = () => true, n = 5): Ranked[] {
  return list
    .filter(keep)
    .map((a) => ({ a, score: score(a) }))
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, n);
}

/** American odds ("+250", "-120") → implied probability 0..1 (before the book's margin). */
export function impliedProb(odds: string): number | undefined {
  const n = Number(String(odds).replace('+', ''));
  if (!n || Number.isNaN(n)) return undefined;
  return n > 0 ? 100 / (n + 100) : -n / (-n + 100);
}

/** A short stat line that explains a player's case. */
export function statLine(a: Athlete): string {
  const parts: string[] = [];
  const py = s(a, 'passing.passingYards');
  if (py > 300) parts.push(`${py.toLocaleString()} pass yds, ${s(a, 'passing.passingTouchdowns')} TD, ${s(a, 'passing.interceptions')} INT`);
  const ry = s(a, 'rushing.rushingYards');
  if (ry >= 100 || (a.pos === 'RB' && ry > 0)) parts.push(`${ry.toLocaleString()} rush yds, ${s(a, 'rushing.rushingTouchdowns')} TD`);
  const rec = s(a, 'receiving.receptions');
  if (rec > 5) parts.push(`${rec} rec, ${s(a, 'receiving.receivingYards').toLocaleString()} yds, ${s(a, 'receiving.receivingTouchdowns')} TD`);
  const sk = s(a, 'defensive.sacks');
  const ints = s(a, 'defensiveinterceptions.interceptions');
  const ff = s(a, 'general.fumblesForced');
  if (s(a, 'defensive.totalTackles') > 0 && !parts.length) {
    const d = [`${s(a, 'defensive.totalTackles')} tkl`];
    if (sk) d.push(`${sk} ${sk === 1 ? 'sack' : 'sacks'}`);
    if (ints) d.push(`${ints} INT`);
    if (ff) d.push(`${ff} FF`);
    if (s(a, 'defensive.tacklesForLoss')) d.push(`${s(a, 'defensive.tacklesForLoss')} TFL`);
    if (s(a, 'defensive.passesDefended')) d.push(`${s(a, 'defensive.passesDefended')} PD`);
    parts.push(d.join(', '));
  }
  return parts.join(' · ');
}
