// Pull fumble and interception details out of ESPN play text, e.g.
//   "J.Love pass short right to M.Redman to GB 9 for 4 yards (A.Van Ginkel). FUMBLES (A.Van Ginkel),
//    RECOVERED by MIN-A.Van Ginkel at GB 10."
// The name in parentheses right after FUMBLES is the player who forced it.

// "J.Love", "A.Van Ginkel", "A.St. Brown", "Am.Wright", "D.O'Neal", "J.Smith-Njigba"
// A second word must look like a name ("Van", "Brown"), not an all-caps keyword ("INTERCEPTED", "GB").
const NAME = String.raw`[A-Z][a-zA-Z]{0,2}\.\s?[A-Z][\w'\-]*(?:\.?\s(?:[A-Z][a-z][\w'\-]*))?`;

export type FumbleInfo = {
  kind: 'fumble';
  fumbledBy?: string;
  forcedBy?: string;
  recoveredBy?: string;
  recoveredTeam?: string;
  /** true when the other team recovered */
  lost?: boolean;
  muffed?: boolean;
  outOfBounds?: boolean;
  /** fumbled out of the end zone: the other team gets the ball */
  touchback?: boolean;
};

export type InterceptionInfo = {
  kind: 'interception';
  passer?: string;
  intendedFor?: string;
  interceptedBy?: string;
};

export type TurnoverInfo = FumbleInfo | InterceptionInfo;

/** ESPN play text uses older team codes in places ("CLV-D.McMillon"); map them to the feed's abbreviations. */
const PLAY_CODES: Record<string, string> = { CLV: 'CLE', HST: 'HOU', BLT: 'BAL', ARZ: 'ARI', WAS: 'WSH', JAC: 'JAX', LA: 'LAR' };
export const normalizeTeamCode = (code: string) => PLAY_CODES[code.toUpperCase()] || code.toUpperCase();

/**
 * The part of the play text that describes what happened. When replay overturns a call ESPN keeps both
 * texts, and the result that stands comes after "REVERSED.". Also drops eligibility notes and a leading clock.
 */
export function finalPlayText(text: string): string {
  const i = text.lastIndexOf('REVERSED.');
  return (i >= 0 ? text.slice(i + 'REVERSED.'.length) : text)
    .replace(new RegExp(String.raw`(?:${NAME}) reported in as eligible\.\s*`, 'g'), '')
    .replace(/^\s*\(\d{1,2}:\d{2}\)\s*/, '')
    .trim();
}

function ballCarrier(text: string): string | undefined {
  // Pass completion: "... pass short right to M.Redman to GB 9"
  let m = text.match(new RegExp(String.raw`\bpass\b[^.]*?\bto (${NAME}) (?:to|for|at|pushed|ran|was)\b`));
  if (m) return m[1];
  // Sack: "K.Cousins sacked at GB 25"
  m = text.match(new RegExp(String.raw`(${NAME}) sacked\b`));
  if (m) return m[1];
  // Return: "...punts 57 yards to NO 23, Center-R.Sunahara. B.Brown to NO 20"
  m = text.match(new RegExp(String.raw`\b(?:kicks|punts)\b.*?\.\s+(${NAME}) (?:to|for|pushed|ran)\b`));
  if (m) return m[1];
  // Run or scramble at the start: "(Shotgun) J.Jacobs up the middle", "C.Ward to TEN 24"
  m = text.match(new RegExp(String.raw`^(?:\([^)]*\)\s*)*(${NAME}) (?:up the middle|left|right|scrambles|kneels|to )`));
  if (m) return m[1];
  return undefined;
}

/**
 * Every fumble or muff in a play, in order. A play can have more than one: a defender recovers,
 * then fumbles it back on the return.
 * @param offenseAbbr team that started the play with the ball
 * @param defenseAbbr the other team (needed for returns, where the returner's team fumbles)
 */
export function parseFumbles(rawText: string, offenseAbbr?: string, defenseAbbr?: string): FumbleInfo[] {
  const text = finalPlayText(rawText);
  const out: FumbleInfo[] = [];
  const re = /\b(FUMBLES|MUFFS)\b/g;
  const hits = [...text.matchAll(re)].map((m) => m.index ?? 0);
  const otherTeam = (abbr?: string) => (abbr && abbr === offenseAbbr ? defenseAbbr : abbr === defenseAbbr ? offenseAbbr : undefined);

  // Who has the ball when the first fumble happens. On a kick or punt it's the receiving team.
  let holder = /\b(kicks|punts)\b/.test(text.slice(0, hits[0] ?? 0)) ? defenseAbbr : offenseAbbr;
  let lastCarrier: string | undefined;

  hits.forEach((at, k) => {
    const segStart = k === 0 ? 0 : hits[k - 1];
    const before = text.slice(segStart, at);
    const after = text.slice(at, hits[k + 1] ?? text.length);
    const info: FumbleInfo = { kind: 'fumble', muffed: after.startsWith('MUFFS') };

    const named = before.match(new RegExp(String.raw`(${NAME})\s+$`));
    if (named) info.fumbledBy = named[1];
    else if (k === 0) info.fumbledBy = ballCarrier(before);
    else {
      // Later fumbles: the last runner named in this stretch ("Lateral to B.Irving to ATL 1"), else whoever recovered.
      const runners = [...before.matchAll(new RegExp(String.raw`(${NAME}) (?:to|for|pushed|ran)\b`, 'g'))];
      info.fumbledBy = runners.length ? runners[runners.length - 1][1] : lastCarrier;
    }

    const forced = after.match(/^(?:FUMBLES|MUFFS)[^(,.]*\(([^)]+)\)/);
    if (forced) info.forcedBy = forced[1].trim();

    const rec = after.match(new RegExp(String.raw`(?:recovered|RECOVERED) by ([A-Z]{2,3})-(${NAME})`));
    if (rec) {
      info.recoveredTeam = normalizeTeamCode(rec[1]);
      info.recoveredBy = rec[2];
      if (holder) info.lost = info.recoveredTeam !== holder.toUpperCase();
    } else if (/\band recovers at\b/.test(after)) {
      // The player fell on his own fumble.
      info.recoveredBy = info.fumbledBy;
      if (holder) info.recoveredTeam = holder.toUpperCase();
      info.lost = false;
    } else if (/out of bounds/i.test(after)) {
      info.outOfBounds = true;
      // Out of the end zone it's a touchback and the other team gets the ball.
      info.touchback = /touchback/i.test(after);
      info.lost = info.touchback;
      if (info.touchback && holder) info.recoveredTeam = otherTeam(holder);
    }

    out.push(info);
    if (info.recoveredTeam) holder = info.recoveredTeam;
    lastCarrier = info.recoveredBy || info.fumbledBy;
  });
  return out;
}

/** The first fumble in a play, or null. */
export function parseFumble(rawText: string, offenseAbbr?: string, defenseAbbr?: string): FumbleInfo | null {
  return parseFumbles(rawText, offenseAbbr, defenseAbbr)[0] || null;
}

export function parseInterception(rawText: string): InterceptionInfo | null {
  const text = finalPlayText(rawText);
  const m = text.match(new RegExp(String.raw`INTERCEPTED by (${NAME})`));
  if (!m) return null;
  const passer = text.match(new RegExp(String.raw`(${NAME}) pass\b`));
  const target = text.match(new RegExp(String.raw`intended for (${NAME})`));
  return { kind: 'interception', interceptedBy: m[1], passer: passer?.[1], intendedFor: target?.[1] };
}

/** All turnover-type events in one play (a play can have an INT and then a fumble on the return). */
export function parseTurnovers(text: string, offenseAbbr?: string, defenseAbbr?: string): TurnoverInfo[] {
  const out: TurnoverInfo[] = [];
  const i = parseInterception(text);
  if (i) out.push(i);
  for (const f of parseFumbles(text, offenseAbbr, defenseAbbr)) {
    // After an interception the defense has the ball, so "lost" is relative to them; leave it unset.
    if (i) delete f.lost;
    out.push(f);
  }
  return out;
}

export function describeTurnover(t: TurnoverInfo): string {
  if (t.kind === 'interception') {
    const parts = [`Intercepted by ${t.interceptedBy}`];
    if (t.passer) parts.push(`thrown by ${t.passer}`);
    if (t.intendedFor) parts.push(`intended for ${t.intendedFor}`);
    return parts.join(', ');
  }
  const parts = [`${t.muffed ? 'Muff' : 'Fumble'}${t.fumbledBy ? ` by ${t.fumbledBy}` : ''}`];
  if (t.forcedBy) parts.push(`forced by ${t.forcedBy}`);
  if (t.recoveredBy) parts.push(`recovered by ${t.recoveredBy} (${t.recoveredTeam})`);
  else if (t.touchback) parts.push('out of the end zone, touchback');
  else if (t.outOfBounds) parts.push('out of bounds');
  return parts.join(', ');
}
