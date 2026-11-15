import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Chips, Crumbs, ErrorBox, Loading, PlayerLink, StatTable, TeamLink, TeamLogo, type Col } from '../components/ui';
import {
  defenseScore,
  impliedProb,
  mergeAthletes,
  offenseScore,
  rank,
  readByAthlete,
  rookieInfo,
  rookieSeason,
  type Athlete,
} from '../lib/awards';
import { urls } from '../lib/espn';
import { useEspn } from '../lib/hooks';
import { useLeague } from '../lib/league';

export function LeaderTabs({ on }: { on: 'leaders' | 'awards' }) {
  return (
    <div className="chips">
      <Link className={`chip ${on === 'leaders' ? 'on' : ''}`} to="/nfl/leaders">
        Stat leaders
      </Link>
      <Link className={`chip ${on === 'awards' ? 'on' : ''}`} to="/nfl/awards">
        Award race
      </Link>
    </div>
  );
}

const TEN_MIN = 10 * 60_000;

type View = 'table' | 'race' | 'compare';
const VIEWS: { v: View; label: string }[] = [
  { v: 'table', label: 'Table' },
  { v: 'race', label: 'Race' },
  { v: 'compare', label: 'Compare' },
];

function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem('ssz.awardView') as View | null;
      return v && VIEWS.some((x) => x.v === v) ? v : 'table';
    } catch {
      return 'table';
    }
  });
  return [
    view,
    (v) => {
      setView(v);
      try {
        localStorage.setItem('ssz.awardView', v);
      } catch {
        /* private mode */
      }
    },
  ];
}

/** One candidate in an award race. MVP entries carry odds; the rest carry a stat score. */
type Entry = { a: Athlete; score: number; odds?: string; prob?: number };
type AwardKind = 'mvp' | 'offense' | 'defense';

const s = (a: Athlete, k: string) => a.stats[k] || 0;
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));

/** The stats that decide each award, used as Table columns and Compare rows. `low` = lower is better. */
function keyStats(kind: AwardKind): { label: string; get: (a: Athlete) => number; low?: boolean }[] {
  if (kind === 'mvp')
    return [
      { label: 'Pass yds', get: (a) => s(a, 'passing.passingYards') },
      { label: 'Tot TD', get: (a) => s(a, 'passing.passingTouchdowns') + s(a, 'rushing.rushingTouchdowns') },
      { label: 'INT', get: (a) => s(a, 'passing.interceptions'), low: true },
      { label: 'Rush yds', get: (a) => s(a, 'rushing.rushingYards') },
    ];
  if (kind === 'defense')
    return [
      { label: 'Sacks', get: (a) => s(a, 'defensive.sacks') },
      { label: 'INT', get: (a) => s(a, 'defensiveinterceptions.interceptions') },
      { label: 'FF', get: (a) => s(a, 'general.fumblesForced') },
      { label: 'TFL', get: (a) => s(a, 'defensive.tacklesForLoss') },
      { label: 'Tkl', get: (a) => s(a, 'defensive.totalTackles') },
    ];
  return [
    { label: 'Tot yds', get: (a) => s(a, 'passing.passingYards') + s(a, 'rushing.rushingYards') + s(a, 'receiving.receivingYards') },
    { label: 'Tot TD', get: (a) => s(a, 'passing.passingTouchdowns') + s(a, 'rushing.rushingTouchdowns') + s(a, 'receiving.receivingTouchdowns') },
    { label: 'Rec', get: (a) => s(a, 'receiving.receptions') },
  ];
}

/**
 * MVP odds name players by id. Nearly all are in the stat lists already; for any that aren't, load the
 * athlete once. A fixed number of slots keeps the hook count stable.
 */
const SLOTS = 8;
function useMissingAthletes(ids: string[]): Map<string, Athlete> {
  const padded = [...ids.slice(0, SLOTS), ...Array(Math.max(0, SLOTS - ids.length)).fill(null)];
  // Always SLOTS calls in the same order, so this is a fixed set of hooks.
  const qs = padded.map((id) => useEspn(id ? urls.athlete(id) : null, TEN_MIN));
  const out = new Map<string, Athlete>();
  qs.forEach((q, i) => {
    const at = q.data?.athlete;
    const id = padded[i];
    if (!id || !at) return;
    out.set(id, {
      id,
      name: at.displayName,
      short: at.shortName || at.displayName,
      pos: at.position?.abbreviation || '',
      teamId: at.team?.id ? String(at.team.id) : undefined,
      headshot: at.headshot?.href,
      stats: {},
    });
  });
  return out;
}

export function Awards() {
  const league = useLeague();
  const year: number | undefined = league.standings?.season?.year;
  const [view, setView] = useView();
  const u = (cat: string, sort: string, n: number) => (year ? urls.byAthlete(cat, sort, n, year) : null);
  const qs = [
    useEspn(u('offense:passing', 'passing.passingYards', 40), TEN_MIN),
    useEspn(u('offense:rushing', 'rushing.rushingYards', 60), TEN_MIN),
    useEspn(u('offense:receiving', 'receiving.receivingYards', 60), TEN_MIN),
    useEspn(u('defense', 'defensive.sacks', 80), TEN_MIN),
    // The sort key needs "defensiveInterceptions" (capital I) even though the data calls it "defensiveinterceptions".
    useEspn(u('defense', 'defensiveInterceptions.interceptions', 40), TEN_MIN),
    useEspn(u('defense', 'defensive.totalTackles', 40), TEN_MIN),
    // (Sorting by general.fumblesForced returns an empty list, so forced fumbles come from the lists above.)
  ];
  const fut = useEspn(year ? urls.futures(year) : null, TEN_MIN);

  const ready = !!year && qs.every((q) => q.data);
  const lists = ready ? qs.map((q) => readByAthlete(q.data)) : [];
  const [pass = [], rush = [], recv = [], sacks = [], ints = [], tkl = []] = lists;
  const offense = mergeAthletes(pass, rush, recv);
  const defense = mergeAthletes(sacks, ints, tkl);
  const everyone = mergeAthletes(offense, defense);

  const mvpMarket = (fut.data?.items || []).find((it: any) => /MVP/i.test(it.name || ''));
  const mvpBook: { id: string; odds: string }[] = (mvpMarket?.futures?.[0]?.books || [])
    .map((b: any) => ({ id: String(b.athlete?.$ref || '').match(/athletes\/(\d+)/)?.[1] || '', odds: String(b.value) }))
    .filter((b: { id: string }) => b.id)
    .slice(0, SLOTS);
  const missing = useMissingAthletes(ready ? mvpBook.filter((b) => !everyone.some((a) => a.id === b.id)).map((b) => b.id) : []);

  const failed = qs.find((q) => q.error && !q.data);
  if (failed) return <ErrorBox error={failed.error!} retry={failed.reload} />;
  if (!ready || !year) return <Loading what="Loading the award race" />;

  const isRookie = (a: Athlete) => rookieSeason === year && !!rookieInfo(a.id);
  const toEntries = (r: { a: Athlete; score: number }[]): Entry[] => r.map(({ a, score }) => ({ a, score }));
  const mvp: Entry[] = mvpBook.length
    ? mvpBook
        .map((b): Entry | null => {
          const a = everyone.find((x) => x.id === b.id) || missing.get(b.id);
          return a ? { a, score: offenseScore(a), odds: b.odds, prob: impliedProb(b.odds) } : null;
        })
        .filter((e): e is Entry => !!e)
    : toEntries(rank(pass, offenseScore));
  const rookiesOk = rookieSeason === year;
  const rookieNote = <p className="muted small">The rookie list is from the {rookieSeason} draft; it needs updating for {year}.</p>;

  const awards: { title: string; kind: AwardKind; entries: Entry[]; how: string; rookies?: boolean; note?: ReactNode }[] = [
    {
      title: 'Most Valuable Player',
      kind: 'mvp',
      entries: mvp,
      how: mvpBook.length
        ? 'Ranked by DraftKings odds (via ESPN). The percentage is the chance those odds imply.'
        : 'No odds available right now, so this ranks quarterbacks by the offense score.',
    },
    {
      title: 'Offensive Player of the Year',
      kind: 'offense',
      entries: toEntries(rank(offense, offenseScore, (a) => a.pos !== 'QB')),
      how: 'Non-quarterbacks ranked by offense score (QBs are covered by MVP). Score: 1 pt per 10 rushing or receiving yards, 6 per TD, 0.5 per catch, -2 per fumble lost.',
    },
    {
      title: 'Defensive Player of the Year',
      kind: 'defense',
      entries: toEntries(rank(defense, defenseScore)),
      how: 'Score: 4 per sack, 5 per interception, 4 per forced fumble, 2 per fumble recovery, 6 per defensive TD, 1 per tackle for loss, 1 per pass defended, 0.2 per tackle.',
    },
    {
      title: 'Offensive Rookie of the Year',
      kind: 'offense',
      rookies: true,
      entries: rookiesOk ? toEntries(rank(offense, offenseScore, isRookie)) : [],
      note: rookiesOk ? undefined : rookieNote,
      how: `${year} draft picks ranked by offense score, quarterbacks included: 1 pt per 25 passing yards, 4 per passing TD, -2 per INT, plus the rushing and receiving points.`,
    },
    {
      title: 'Defensive Rookie of the Year',
      kind: 'defense',
      rookies: true,
      entries: rookiesOk ? toEntries(rank(defense, defenseScore, isRookie)) : [],
      note: rookiesOk ? undefined : rookieNote,
      how: `${year} draft picks ranked by the defense score.`,
    },
  ];

  return (
    <div>
      <Crumbs items={[{ label: 'Award race' }]} />
      <h1 className="page-title">{year} award race</h1>
      <LeaderTabs on="awards" />
      <p className="small muted">Projected winners if the season ended today. Tap any player for their stats.</p>
      <div className="view-pick">
        <span className="small muted">View</span>
        <Chips options={VIEWS} value={view} onChange={setView} />
      </div>

      {awards.map((aw) => (
        <section key={aw.title} className="award card">
          <h2>{aw.title}</h2>
          {aw.note ||
            (aw.entries.length === 0 ? (
              <p className="muted small">No qualifying players yet.</p>
            ) : view === 'table' ? (
              <TableView kind={aw.kind} entries={aw.entries} rookies={aw.rookies} />
            ) : view === 'race' ? (
              <RaceView kind={aw.kind} entries={aw.entries} />
            ) : (
              <CompareView kind={aw.kind} entries={aw.entries} />
            ))}
          <details>
            <summary className="small muted">How it's projected</summary>
            <p className="small muted">{aw.how}</p>
          </details>
        </section>
      ))}

      <p className="small muted">
        Comeback Player and Coach of the Year aren't projected: they depend on things the stats don't show, like last season's injuries or a new
        coaching staff. Rookies are players drafted in {rookieSeason}; undrafted rookies aren't included.
      </p>
    </div>
  );
}

function Who({ e, rookies }: { e: Entry; rookies?: boolean }) {
  const r = rookies ? rookieInfo(e.a.id) : undefined;
  return (
    <span className="aw-cell">
      <PlayerLink id={e.a.id} name={e.a.name} />
      <span className="aw-sub">
        {e.a.teamId && <TeamLogo id={e.a.teamId} size={14} />} {e.a.pos}
        {r ? ` · Rd ${r.round}, #${r.overall}` : ''}
      </span>
    </span>
  );
}

/** A: stat sheet. Sortable columns of the stats that decide the award. */
function TableView({ kind, entries, rookies }: { kind: AwardKind; entries: Entry[]; rookies?: boolean }) {
  const leader = entries[0]?.a.id;
  const cols: Col<Entry>[] = [
    { key: 'rk', label: '#', value: (e) => -entries.indexOf(e), render: (e) => entries.indexOf(e) + 1 },
    { key: 'who', label: 'Player', left: true, value: (e) => e.a.name, render: (e) => <Who e={e} rookies={rookies} /> },
    // What decides the ranking goes first, so it's visible without swiping on a phone.
    kind === 'mvp'
      ? { key: 'odds', label: 'Odds', highlight: true, value: (e: Entry) => e.prob ?? 0, render: (e: Entry) => e.odds }
      : { key: 'pts', label: 'Pts', highlight: true, value: (e: Entry) => e.score, render: (e: Entry) => e.score.toFixed(0) },
    ...keyStats(kind).map((k) => ({ key: k.label, label: k.label, value: (e: Entry) => k.get(e.a), render: (e: Entry) => fmt(k.get(e.a)) })),
  ];
  return <StatTable dense rows={entries} rowKey={(e) => e.a.id} hl={(e) => e.a.id === leader} cols={cols} />;
}

/** C: race track. Each player's bar is their share of the leader's score (or win chance for MVP). */
function RaceView({ kind, entries }: { kind: AwardKind; entries: Entry[] }) {
  const league = useLeague();
  const val = (e: Entry) => (kind === 'mvp' ? e.prob ?? 0 : e.score);
  const top = Math.max(...entries.map(val), 0.0001);
  return (
    <div className="race">
      {entries.map((e) => {
        const t = e.a.teamId ? league.byId[e.a.teamId] : undefined;
        return (
          <div key={e.a.id} className="lane" style={{ ['--tc' as string]: t?.color }}>
            <div className="lane-who">
              {e.a.teamId && <TeamLogo id={e.a.teamId} size={16} />}
              <PlayerLink id={e.a.id} name={e.a.name} />
            </div>
            <div className="lane-v">{kind === 'mvp' ? `${Math.round((e.prob ?? 0) * 100)}%` : e.score.toFixed(0)}</div>
            <div className="rail" aria-hidden="true">
              <div className="fill" style={{ width: `${Math.max(6, (val(e) / top) * 100).toFixed(1)}%` }} />
            </div>
          </div>
        );
      })}
      <div className="race-foot small muted">
        <span>{kind === 'mvp' ? 'Chance to win, from the odds' : 'Score compared with the leader'}</span>
        {kind === 'mvp' && <span>Odds: {entries.map((e) => e.odds).join(' · ')}</span>}
      </div>
    </div>
  );
}

/** D: head to head. The top three side by side; the best number in each row is highlighted. */
function CompareView({ kind, entries }: { kind: AwardKind; entries: Entry[] }) {
  const top = entries.slice(0, 3);
  const rows = [
    ...keyStats(kind),
    kind === 'mvp'
      ? { label: 'Win %', get: (a: Athlete) => Math.round((top.find((e) => e.a === a)?.prob ?? 0) * 100) }
      : { label: 'Pts', get: (a: Athlete) => Math.round(top.find((e) => e.a === a)?.score ?? 0) },
  ];
  return (
    <div className="table-wrap">
      <table className="h2h">
        <thead>
          <tr>
            <th />
            {top.map((e, i) => (
              <th key={e.a.id} className={i === 0 ? 'lead' : ''}>
                {e.a.headshot ? <img className="h2h-face" src={e.a.headshot} alt="" loading="lazy" /> : <span className="h2h-face" />}
                <PlayerLink id={e.a.id} name={e.a.name} />
                <span className="aw-sub">{e.a.teamId && <TeamLink id={e.a.teamId} label="abbr" size={14} />}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const vals = top.map((e) => r.get(e.a));
            const best = 'low' in r && r.low ? Math.min(...vals) : Math.max(...vals);
            const tie = vals.every((v) => v === best);
            const max = Math.max(...vals, 1);
            return (
              <tr key={r.label}>
                <td className="lab">{r.label}</td>
                {vals.map((v, i) => (
                  <td key={i} className={!tie && v === best ? 'best' : ''}>
                    {fmt(v)}
                    {r.label === 'Win %' ? '%' : ''}
                    <span className="mini" aria-hidden="true">
                      <i style={{ width: `${((v / max) * 100).toFixed(0)}%` }} />
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {entries.length > 3 && <p className="small muted h2h-more">Also in the race: {entries.slice(3).map((e) => e.a.name).join(', ')}.</p>}
    </div>
  );
}

