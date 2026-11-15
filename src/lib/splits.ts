// Rebuild box-score stats from play-by-play so they can be split by quarter.
// ESPN only publishes full-game box scores; every play has its quarter and its text, so we
// read each play the way the official scorer would and add it up for whichever quarters are picked.
//
// Checked against ESPN's full-game box scores (see scripts/check-splits.mts): the full-game
// sums from this file should match ESPN's numbers for passing, rushing, receiving and fumbles.

import { NAME, finalPlayText, normalizeTeamCode, parseFumbles } from './turnovers';

export type Split = 'all' | 'q1' | 'q2' | 'q3' | 'q4' | 'h1' | 'h2' | 'ot';

export const SPLITS: { v: Split; label: string }[] = [
  { v: 'all', label: 'Game' },
  { v: 'q1', label: 'Q1' },
  { v: 'q2', label: 'Q2' },
  { v: 'q3', label: 'Q3' },
  { v: 'q4', label: 'Q4' },
  { v: 'h1', label: '1st half' },
  { v: 'h2', label: '2nd half' },
  { v: 'ot', label: 'OT' },
];

export function inSplit(period: number, split: Split): boolean {
  switch (split) {
    case 'all':
      return true;
    case 'q1':
      return period === 1;
    case 'q2':
      return period === 2;
    case 'q3':
      return period === 3;
    case 'q4':
      return period === 4;
    case 'h1':
      return period <= 2;
    case 'h2':
      return period === 3 || period === 4;
    case 'ot':
      return period >= 5;
  }
}

export type PlayIn = {
  text: string;
  period: number;
  offense?: string; // abbreviation of the team that started the play with the ball
  defense?: string;
  startDown?: number;
  startDistance?: number;
  startToGo?: number; // yards to the end zone at the snap
  endDown?: number;
  endToGo?: number;
  endTeam?: string;
  scoring?: boolean;
  /** ESPN's own yardage for the play (penalty- and lateral-adjusted); preferred over the text. */
  statYardage?: number;
};

export type PassLine = { comp: number; att: number; yds: number; td: number; int: number; sacks: number; sackYds: number };
export type RushLine = { car: number; yds: number; td: number; long: number };
export type RecLine = { rec: number; yds: number; td: number; long: number; tgts: number };
export type FumLine = { fum: number; lost: number; rec: number };
export type DefLine = { tot: number; solo: number; sacks: number; tfl: number; int: number; ff: number; fr: number; td: number };
export type RetLine = { no: number; yds: number; long: number; td: number };
export type KickLine = { fgm: number; fga: number; long: number; xpm: number; xpa: number; pts: number };
export type PuntLine = { no: number; yds: number; long: number; in20: number; tb: number };

export type TeamTotals = {
  plays: number;
  yards: number;
  passYds: number; // net (gross minus sack yards)
  comp: number;
  att: number;
  sacks: number;
  sackYds: number;
  rushAtt: number;
  rushYds: number;
  firstDowns: number;
  thirdAtt: number;
  thirdConv: number;
  fourthAtt: number;
  fourthConv: number;
  int: number;
  fumLost: number;
  fum: number;
  penalties: number;
  penYds: number;
  points: number;
};

type Lines<T> = Map<string, T>; // player name as written in play text ("J.Love") → line

export type TeamBox = {
  passing: Lines<PassLine>;
  rushing: Lines<RushLine>;
  receiving: Lines<RecLine>;
  fumbles: Lines<FumLine>;
  defense: Lines<DefLine>;
  kickReturns: Lines<RetLine>;
  puntReturns: Lines<RetLine>;
  kicking: Lines<KickLine>;
  punting: Lines<PuntLine>;
  totals: TeamTotals;
};

const emptyTotals = (): TeamTotals => ({
  plays: 0,
  yards: 0,
  passYds: 0,
  comp: 0,
  att: 0,
  sacks: 0,
  sackYds: 0,
  rushAtt: 0,
  rushYds: 0,
  firstDowns: 0,
  thirdAtt: 0,
  thirdConv: 0,
  fourthAtt: 0,
  fourthConv: 0,
  int: 0,
  fumLost: 0,
  fum: 0,
  penalties: 0,
  penYds: 0,
  points: 0,
});

export const emptyBox = (): TeamBox => ({
  passing: new Map(),
  rushing: new Map(),
  receiving: new Map(),
  fumbles: new Map(),
  defense: new Map(),
  kickReturns: new Map(),
  puntReturns: new Map(),
  kicking: new Map(),
  punting: new Map(),
  totals: emptyTotals(),
});

function line<T>(m: Lines<T>, name: string, make: () => T): T {
  let v = m.get(name);
  if (!v) m.set(name, (v = make()));
  return v;
}
const passLine = (): PassLine => ({ comp: 0, att: 0, yds: 0, td: 0, int: 0, sacks: 0, sackYds: 0 });
const rushLine = (): RushLine => ({ car: 0, yds: 0, td: 0, long: 0 });
const recLine = (): RecLine => ({ rec: 0, yds: 0, td: 0, long: 0, tgts: 0 });
const fumLine = (): FumLine => ({ fum: 0, lost: 0, rec: 0 });
const defLine = (): DefLine => ({ tot: 0, solo: 0, sacks: 0, tfl: 0, int: 0, ff: 0, fr: 0, td: 0 });
const retLine = (): RetLine => ({ no: 0, yds: 0, long: 0, td: 0 });
const kickLine = (): KickLine => ({ fgm: 0, fga: 0, long: 0, xpm: 0, xpa: 0, pts: 0 });
const puntLine = (): PuntLine => ({ no: 0, yds: 0, long: 0, in20: 0, tb: 0 });

const N = NAME;
/** First "for 12 yards" / "for -3 yards" / "for no gain" at or after `from`. */
function yardsAfter(text: string, from = 0): number | undefined {
  const m = text.slice(from).match(/\bfor (-?\d+) yards?\b|\bfor no gain\b/);
  if (!m) return undefined;
  return m[1] != null ? Number(m[1]) : 0;
}

/** Yard line from the `team`'s own goal: "IND 30" for IND → 30, "JAX 40" for IND → 60, "end zone"/"IND -1" → ≤0. */
function ownYardLine(spot: string, team?: string): number | undefined {
  const m = spot.trim().match(/^([A-Z]{2,3})\s+(-?\d+)$|^(50)$/);
  if (!m) return undefined;
  if (m[3]) return 50;
  const n = Number(m[2]);
  return normalizeTeamCode(m[1]) === team ? n : 100 - n;
}

/** A return is credited only up to the spot of a foul by the return team enforced during it. */
function returnCredited(text: string, yds: number, returnTeam?: string): number {
  if (!returnTeam || yds <= 0) return yds;
  const land = text.match(/(?:kicks|punts) \d+ yards? (?:from [A-Z]{2,3} \d+ )?to ([A-Z]{2,3} -?\d+|50)/);
  const from = land ? ownYardLine(land[1], returnTeam) : undefined;
  if (from == null) return yds;
  for (const m of text.matchAll(/PENALTY on ([A-Z]{2,3})-[^,]*,[^,]+,\s*\d+ yards?, enforced at ([A-Z]{2,3}\s+\d+|50)/gi)) {
    if (normalizeTeamCode(m[1]) !== returnTeam) continue;
    const spot = ownYardLine(m[2], returnTeam);
    if (spot == null) continue;
    const toSpot = spot - Math.max(from, 0);
    if (toSpot >= 0 && toSpot < yds) return toSpot;
  }
  return yds;
}

/** "Lateral to J.Coker to CAR 26 for 2 yards" → [{ name, yds }] */
function laterals(text: string): { name: string; yds: number }[] {
  const out: { name: string; yds: number }[] = [];
  for (const m of text.matchAll(new RegExp(`Lateral to (${N})`, 'g'))) {
    const yds = yardsAfter(text, (m.index ?? 0) + m[0].length);
    if (yds != null) out.push({ name: m[1], yds });
  }
  return out;
}

/** "CAR 25" or "50" → yards to the end zone for `offense`. */
function spotToGo(spot: string, offense?: string): number | undefined {
  const m = spot.trim().match(/^(?:([A-Z]{2,3})\s+)?(\d+)$/);
  if (!m) return undefined;
  const yl = Number(m[2]);
  if (!m[1]) return yl; // midfield
  return normalizeTeamCode(m[1]) === offense ? 100 - yl : yl;
}

/**
 * Official scoring credits a gain only up to the spot of an offensive foul enforced during the run
 * (holding downfield, illegal block). Returns the credited yards, or the text yards when that rule doesn't apply.
 */
function creditedYards(text: string, yds: number, p: PlayIn): number {
  if (p.startToGo == null || !p.offense || yds <= 0) return yds;
  for (const m of text.matchAll(/PENALTY on ([A-Z]{2,3})-[^,]*,[^,]+,\s*\d+ yards?, enforced at ([A-Z]{2,3}\s+\d+|50)/gi)) {
    if (normalizeTeamCode(m[1]) !== p.offense) continue;
    const toGo = spotToGo(m[2], p.offense);
    if (toGo == null) continue;
    const toSpot = p.startToGo - toGo;
    if (toSpot >= 0 && toSpot < yds) return toSpot;
  }
  return yds;
}

/** The ball carrier scored, i.e. TOUCHDOWN comes before any turnover in the text. */
function offenseTD(text: string): boolean {
  const td = text.indexOf('TOUCHDOWN');
  if (td < 0) return false;
  const to = text.search(/INTERCEPTED|FUMBLES|MUFFS/);
  return to < 0 || td < to;
}

/** Tacklers in the first (...) after `from`: "(A.Smith; B.Jones)" is a shared tackle. */
function tacklers(text: string, from: number): string[] {
  const seg = text.slice(from);
  const stop = seg.search(/\.\s|FUMBLES|$/);
  const m = seg.slice(0, stop < 0 ? undefined : stop + 1).match(/\(([^)]*)\)/);
  if (!m) return [];
  return m[1]
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s) => new RegExp(`^${N}$`).test(s));
}

function addTackles(box: TeamBox, names: string[], lossOnPlay: boolean) {
  for (const n of names) {
    const d = line(box.defense, n, defLine);
    d.tot += 1;
    if (names.length === 1) d.solo += 1;
    if (lossOnPlay) d.tfl += names.length === 1 ? 1 : 0.5;
  }
}

/**
 * Add one play to the two teams' boxes. `boxes` is keyed by team abbreviation.
 * Returns nothing; mutates the boxes.
 */
/** "Jalen Coker" → "J.Coker", the form play text uses. Drops Jr./Sr./II/III/IV. */
export function shortName(full: string): string {
  const parts = full.replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, '').trim().split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts[0][0]}.${parts.slice(1).join(' ')}`;
}

/**
 * Some plays come in ESPN's summary form instead ("Jalen Coker 26 Yd pass from Bryce Young (...)",
 * "Josh Jacobs 3 Yd Run (...)"). Rewrite them into play-by-play form so the readers below handle them.
 */
function fromSummaryForm(text: string): string {
  let m = text.match(/^([A-Z][\w'.\- ]+?) (\d+) Yd pass from ([A-Z][\w'.\- ]+?)(?: \(|$)/);
  if (m) return `${shortName(m[3])} pass to ${shortName(m[1])} for ${m[2]} yards, TOUCHDOWN.`;
  m = text.match(/^([A-Z][\w'.\- ]+?) (\d+) Yd (?:Run|Rush)(?: \(|$)/);
  if (m) return `${shortName(m[1])} up the middle for ${m[2]} yards, TOUCHDOWN.`;
  return text;
}

export function addPlay(boxes: Record<string, TeamBox>, p: PlayIn) {
  // A two-point try after a touchdown is not part of the play's stats.
  const text = fromSummaryForm(finalPlayText(p.text || '').split(/TWO-POINT CONVERSION ATTEMPT/i)[0]);
  const off = p.offense ? boxes[p.offense] : undefined;
  const def = p.defense ? boxes[p.defense] : undefined;
  if (!off || !def) return;

  // Penalties count for team stats even on "No Play".
  for (const m of text.matchAll(/PENALTY on ([A-Z]{2,3})(?:-[^,]*)?,\s*([^,]+),\s*(\d+) yards?/gi)) {
    const seg = text.slice(m.index ?? 0, (m.index ?? 0) + m[0].length + 30);
    if (/declined|offsetting/i.test(seg)) continue;
    const t = boxes[normalizeTeamCode(m[1])];
    if (!t) continue;
    t.totals.penalties += 1;
    t.totals.penYds += Number(m[3]);
  }
  // Flags with no yardage still count: offsetting fouls, kickoffs out of bounds ("placed at the 40").
  for (const m of text.matchAll(/PENALTY on ([A-Z]{2,3})(?:-[^,]*)?,\s*[^,]+,\s*(?:offsetting|placed at)/gi)) {
    const t = boxes[normalizeTeamCode(m[1])];
    if (t) t.totals.penalties += 1;
  }

  if (/No Play/i.test(text)) return;

  const fumbles = parseFumbles(text, p.offense, p.defense);
  let scrimmage = false;
  let gain = 0;

  // ---- kicks ----
  const kickoff = text.match(new RegExp(`(${N}) kicks (\\d+) yards? from`));
  const punt = text.match(new RegExp(`(${N}) punts (\\d+) yards?`));
  const fg = text.match(new RegExp(`(${N}) (\\d+) yard field goal is (GOOD|No Good|BLOCKED)`));
  const xp = text.match(new RegExp(`(${N}) extra point is (GOOD|No Good|Blocked|BLOCKED)`));

  if (fg) {
    const k = line(off.kicking, fg[1], kickLine);
    k.fga += 1;
    if (fg[3] === 'GOOD') {
      k.fgm += 1;
      k.pts += 3;
      k.long = Math.max(k.long, Number(fg[2]));
      off.totals.points += 3;
    }
  }
  if (xp) {
    const k = line(off.kicking, xp[1], kickLine);
    k.xpa += 1;
    if (xp[2] === 'GOOD') {
      k.xpm += 1;
      k.pts += 1;
      off.totals.points += 1;
    }
  }

  if (kickoff || punt) {
    // Returner: first "Name to/for/pushed/ran" after the kick (skips "Name MUFFS catch, and recovers at …").
    const ret = text.match(new RegExp(`(?:kicks|punts)\\b.*?\\.\\s+(${N}) (?:to |for |pushed |ran )`));
    if (punt) {
      const pl = line(off.punting, punt[1], puntLine);
      pl.no += 1;
      pl.yds += Number(punt[2]);
      pl.long = Math.max(pl.long, Number(punt[2]));
      if (/Touchback/i.test(text)) pl.tb += 1;
    }
    if (ret && !/fair catch|Touchback/i.test(ret[0])) {
      const raw = yardsAfter(text, text.indexOf(ret[1], text.search(/kicks|punts/))) ?? 0;
      const yds = returnCredited(text, raw, p.defense);
      const r = line(kickoff ? def.kickReturns : def.puntReturns, ret[1], retLine);
      r.no += 1;
      r.yds += yds;
      r.long = Math.max(r.long, yds);
      if (offenseTD(text.slice(text.indexOf(ret[1])))) {
        r.td += 1;
        def.totals.points += 6;
      }
      const tk = tacklers(text, text.indexOf(ret[1], text.search(/kicks|punts/)));
      addTackles(off, tk, false);
    }
  }

  // ---- scrimmage plays ----
  const sack = text.match(new RegExp(`(${N}) sacked (?:ob )?at [^(]*?for (-?\\d+) yards?|(${N}) sacked (?:ob )?at [^(]*?for no gain`));
  const pass = !sack && text.match(new RegExp(`(${N}) pass\\b`));
  const kneel = text.match(new RegExp(`(${N}) kneels\\b`));
  const spike = text.match(new RegExp(`(${N}) spiked the ball`));
  const rush =
    !sack &&
    !pass &&
    !kickoff &&
    !punt &&
    text.match(
      new RegExp(
        `^(?:\\([^)]*\\)\\s*)*(?:Direct snap to (?:${N})\\.\\s*)?(${N}) (?:up the middle|(?:left|right) (?:end|tackle|guard)|scrambles|to [A-Z0-9]|for |FUMBLES)`,
      ),
    );

  if (sack) {
    scrimmage = true;
    const name = sack[1] || sack[3];
    const yds = sack[2] != null ? Number(sack[2]) : 0;
    const q = line(off.passing, name, passLine);
    q.sacks += 1;
    q.sackYds += -yds;
    off.totals.sacks += 1;
    off.totals.sackYds += -yds;
    off.totals.passYds += yds;
    gain = yds;
    // Sackers: "(A.Smith)" or "(A.Smith; B.Jones)" = half each.
    const sk = tacklers(text, text.indexOf('sacked'));
    for (const n of sk) {
      const d = line(def.defense, n, defLine);
      d.sacks += 1 / sk.length;
      d.tot += 1;
      if (sk.length === 1) d.solo += 1;
      d.tfl += 1 / sk.length;
    }
  } else if (spike) {
    scrimmage = true;
    const q = line(off.passing, spike[1], passLine);
    q.att += 1;
    off.totals.att += 1;
  } else if (pass) {
    scrimmage = true;
    const passer = pass[1];
    const q = line(off.passing, passer, passLine);
    q.att += 1;
    off.totals.att += 1;
    const target = text.match(new RegExp(`(?:pass[^.]*?\\bto|intended for) (${N})`));
    if (target) line(off.receiving, target[1], recLine).tgts += 1;
    const intc = text.match(new RegExp(`INTERCEPTED by (${N})`));
    if (intc) {
      q.int += 1;
      off.totals.int += 1;
      const d = line(def.defense, intc[1], defLine);
      d.int += 1;
      if (/TOUCHDOWN/.test(text.slice(text.indexOf('INTERCEPTED')))) {
        d.td += 1;
        def.totals.points += 6;
      }
    } else if (!/pass incomplete/.test(text) && target) {
      const yds = creditedYards(text, yardsAfter(text, text.indexOf(target[1], text.indexOf(passer) + passer.length)) ?? 0, p);
      q.comp += 1;
      q.yds += yds;
      off.totals.comp += 1;
      off.totals.passYds += yds;
      const r = line(off.receiving, target[1], recLine);
      r.rec += 1;
      r.yds += yds;
      r.long = Math.max(r.long, yds);
      gain = yds;
      for (const lat of laterals(text)) {
        // Yards after a lateral count as passing yards and as receiving yards for whoever caught the lateral.
        q.yds += lat.yds;
        off.totals.passYds += lat.yds;
        const lr = line(off.receiving, lat.name, recLine);
        lr.yds += lat.yds;
        gain += lat.yds;
      }
      if (offenseTD(text)) {
        q.td += 1;
        r.td += 1;
        off.totals.points += 6;
      }
      addTackles(def, tacklers(text, text.indexOf(target[1], text.indexOf(passer) + passer.length)), yds < 0);
    }
  } else if (kneel || rush) {
    scrimmage = true;
    const name = ((kneel || rush) as RegExpMatchArray)[1];
    const yds = creditedYards(text, yardsAfter(text, text.indexOf(name)) ?? 0, p);
    const r = line(off.rushing, name, rushLine);
    r.car += 1;
    r.yds += yds;
    r.long = Math.max(r.long, yds);
    off.totals.rushAtt += 1;
    off.totals.rushYds += yds;
    gain = yds;
    for (const lat of laterals(text)) {
      // Rushing yards after a lateral go to the lateral's receiver, without a carry.
      line(off.rushing, lat.name, rushLine).yds += lat.yds;
      off.totals.rushYds += lat.yds;
      gain += lat.yds;
    }
    if (offenseTD(text)) {
      r.td += 1;
      off.totals.points += 6;
    }
    if (!kneel) addTackles(def, tacklers(text, text.indexOf(name)), yds < 0);
  }

  // ---- fumbles ----
  for (const f of fumbles) {
    const team = f.team ? boxes[f.team] : undefined;
    const other = f.team === p.offense ? def : off;
    if (team && f.fumbledBy) {
      const l = line(team.fumbles, f.fumbledBy, fumLine);
      l.fum += 1;
      team.totals.fum += 1;
      if (f.lost) {
        l.lost += 1;
        team.totals.fumLost += 1;
      }
    }
    if (f.forcedBy && f.forcedBy !== 'Aborted' && new RegExp(`^${N}$`).test(f.forcedBy)) line(other.defense, f.forcedBy, defLine).ff += 1;
    if (f.recoveredBy && f.recoveredTeam) {
      const rt = boxes[f.recoveredTeam];
      if (rt) {
        line(rt.fumbles, f.recoveredBy, fumLine).rec += 1;
        if (f.lost) line(rt.defense, f.recoveredBy, defLine).fr += 1;
      }
    }
  }

  if (!scrimmage) return;
  off.totals.plays += 1;
  off.totals.yards += gain;

  // Downs: did the play reach the line to gain?
  if (p.startDown && p.startDown > 0 && p.startDistance != null) {
    const turnover = /INTERCEPTED/.test(text) || fumbles.some((f) => f.lost);
    // ESPN's play yardage includes penalties enforced during the play, which decide the line to gain.
    const madeIt = !turnover && (p.statYardage ?? gain) >= p.startDistance;
    if (madeIt) off.totals.firstDowns += 1;
    if (p.startDown === 3) {
      off.totals.thirdAtt += 1;
      if (madeIt) off.totals.thirdConv += 1;
    }
    if (p.startDown === 4) {
      off.totals.fourthAtt += 1;
      if (madeIt) off.totals.fourthConv += 1;
    }
  }
}

/** Build both teams' boxes from summary plays for one split. */
export function buildBoxes(plays: PlayIn[], teams: string[], split: Split): Record<string, TeamBox> {
  const boxes: Record<string, TeamBox> = {};
  for (const t of teams) boxes[t] = emptyBox();
  for (const p of plays) if (inSplit(p.period, split)) addPlay(boxes, p);
  return boxes;
}

/** Turn an ESPN summary play into the small shape addPlay needs. */
export function toPlayIn(p: any, abbrOf: (id?: string) => string | undefined, otherOf: (abbr?: string) => string | undefined): PlayIn {
  const offense = abbrOf(p.start?.team?.id || p._drive?.team?.id);
  return {
    text: p.text || '',
    period: p.period?.number || 0,
    offense,
    defense: otherOf(offense),
    startDown: p.start?.down,
    startDistance: p.start?.distance,
    startToGo: p.start?.yardsToEndzone,
    endDown: p.end?.down,
    endToGo: p.end?.yardsToEndzone,
    endTeam: abbrOf(p.end?.team?.id),
    scoring: !!p.scoringPlay,
    statYardage: typeof p.statYardage === 'number' ? p.statYardage : undefined,
  };
}

/** Play-text name forms for an ESPN athlete ({ firstName, lastName, displayName }). */
export function nameKeys(a: { firstName?: string; lastName?: string; displayName?: string }): string[] {
  const last = String(a.lastName || '').replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, '');
  const first = String(a.firstName || '');
  const keys = new Set<string>();
  if (first && last) {
    keys.add(`${first[0]}.${last}`);
    keys.add(`${first.slice(0, 2)}.${last}`);
  }
  if (a.displayName) keys.add(shortName(a.displayName));
  return [...keys];
}

/** Find an athlete's line by name; falls back to a unique last-name match (nicknames like "Bam"). */
export function findLine<T>(m: Map<string, T>, a: { firstName?: string; lastName?: string; displayName?: string }): T | undefined {
  for (const k of nameKeys(a)) {
    const v = m.get(k);
    if (v) return v;
  }
  const last = String(a.lastName || '').replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, '');
  const hits = [...m.keys()].filter((k) => k.slice(k.indexOf('.') + 1) === last);
  return hits.length === 1 ? m.get(hits[0]) : undefined;
}
