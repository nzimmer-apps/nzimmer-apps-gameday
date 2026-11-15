import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Chips, Crumbs, ErrorBox, Loading, PlayerLink, Section, StatTable, Tabs, TeamLink, TeamLogo, fmtTime, useTab } from '../components/ui';
import { stat, statusState, urls } from '../lib/espn';
import { useEspn } from '../lib/hooks';
import { useLeague } from '../lib/league';
import { describeTurnover, finalPlayText, parseTurnovers, type TurnoverInfo } from '../lib/turnovers';
import { nameKeys, toPlayIn, type PlayIn } from '../lib/splits';
import { SplitBox, SplitPicker, SplitTeamStats, useSplit, type SplitTeam } from './GameSplits';

const TABS = ['summary', 'box', 'plays', 'stats', 'odds'];
const TAB_LABELS = { summary: 'Summary', box: 'Box score', plays: 'Plays', stats: 'Team stats', odds: 'Win %' };

type Ctx = {
  d: any;
  home: any; // header competitor
  away: any;
  nameToId: Map<string, string>;
  nameRe: RegExp | null;
  plays: any[]; // every play in order, each with ._drive
  playIns: PlayIn[]; // the same plays in the shape the quarter-split stats need
  teams: SplitTeam[];
  idName: Map<string, string>;
  maxPeriod: number;
  linescores: Record<string, number[]>;
};

export function Game() {
  const { id = '' } = useParams();
  const first = useEspn(urls.summary(id), 60_000);
  const isLive = statusState(first.data?.header?.competitions?.[0]?.status) === 'in';
  const live = useEspn(isLive ? urls.summary(id) : null, 15_000);
  const d = (isLive && live.data) || first.data;
  const [tab, setTab] = useTab(TABS);

  const ctx = useMemo<Ctx | null>(() => {
    if (!d) return null;
    const comp = d.header?.competitions?.[0] || {};
    const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp.competitors?.find((c: any) => c.homeAway === 'away');

    // Play text uses "J.Love"; map that form to athlete ids so names become links.
    const nameToId = new Map<string, string>();
    const idName = new Map<string, string>();
    for (const team of d.boxscore?.players || [])
      for (const cat of team.statistics || [])
        for (const a of cat.athletes || []) {
          const at = a.athlete;
          if (!at?.firstName || !at?.lastName) continue;
          for (const k of nameKeys(at)) nameToId.set(k, String(at.id));
          if (at.displayName) {
            nameToId.set(at.displayName, String(at.id));
            idName.set(String(at.id), at.displayName);
          }
        }
    const keys = [...nameToId.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const nameRe = keys.length ? new RegExp(`(?<![A-Za-z])(${keys.join('|')})(?![a-z])`, 'g') : null;

    const drives = [...(d.drives?.previous || [])];
    if (d.drives?.current && !drives.some((x) => x.id === d.drives.current.id)) drives.push(d.drives.current);
    // ESPN occasionally lists the same play twice; keep the first copy.
    const seen = new Set<string>();
    const plays = drives
      .flatMap((dr: any) => (dr.plays || []).map((p: any) => ({ ...p, _drive: dr })))
      .filter((p: any) => {
        const k = `${p.period?.number}|${p.clock?.displayValue}|${p.text}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    const sides = [away, home].filter(Boolean);
    const abbrOf = (id?: string) => sides.find((c: any) => String(c.team?.id) === String(id))?.team?.abbreviation;
    const otherOf = (ab?: string) => sides.find((c: any) => c.team?.abbreviation !== ab)?.team?.abbreviation;
    const playIns = plays.map((p: any) => toPlayIn(p, abbrOf, otherOf));
    const teams: SplitTeam[] = sides.map((c: any) => ({ id: String(c.team?.id), abbr: c.team?.abbreviation, name: c.team?.displayName, home: c.homeAway === 'home' }));
    const maxPeriod = Math.max(0, ...plays.map((p: any) => p.period?.number || 0));
    const linescores: Record<string, number[]> = {};
    for (const c of sides) linescores[c.team?.abbreviation] = (c.linescores || []).map((l: any) => Number(l.displayValue) || 0);
    return { d, home, away, nameToId, nameRe, plays, playIns, teams, idName, maxPeriod, linescores };
  }, [d]);
  const [split, setSplit, splitOptions] = useSplit(ctx?.maxPeriod || 0);

  if (first.error && !d) return <ErrorBox error={first.error} retry={first.reload} />;
  if (!d || !ctx) return <Loading what="Loading game" />;

  const { home, away } = ctx;
  const h = d.header || {};

  return (
    <div>
      <Crumbs
        items={[
          { to: h.week ? `/nfl/week/${h.season?.year}/${h.season?.type}/${h.week}` : '/', label: h.week ? (h.season?.type === 3 ? 'Playoffs' : `Week ${h.week}`) : 'Scores' },
          { label: `${away?.team?.abbreviation} @ ${home?.team?.abbreviation}` },
        ]}
      />
      <ScoreHeader ctx={ctx} />
      <Tabs tabs={TABS} labels={TAB_LABELS} value={tab} onChange={setTab} />
      {tab === 'summary' && <SummaryTab ctx={ctx} />}
      {(tab === 'box' || tab === 'stats') && <SplitPicker split={split} setSplit={setSplit} options={splitOptions} />}
      {tab === 'box' && (split === 'all' ? <BoxTab ctx={ctx} /> : <SplitBox plays={ctx.playIns} teams={ctx.teams} split={split} names={ctx} />)}
      {tab === 'plays' && <PlaysTab ctx={ctx} />}
      {tab === 'stats' &&
        (split === 'all' ? <TeamStatsTab ctx={ctx} /> : <SplitTeamStats plays={ctx.playIns} teams={ctx.teams} split={split} linescores={ctx.linescores} />)}
      {tab === 'odds' && <WinProbTab ctx={ctx} />}
    </div>
  );
}

// ---------- header ----------

function ScoreHeader({ ctx }: { ctx: Ctx }) {
  const comp = ctx.d.header?.competitions?.[0] || {};
  const st = comp.status;
  const state = statusState(st);
  const sit = ctx.plays.length ? ctx.d.drives?.current?.plays?.slice(-1)?.[0]?.end : null;
  const periods = Math.max(4, ...[ctx.away, ctx.home].map((c) => c?.linescores?.length || 0));

  const side = (c: any) => (
    <div className={`sh-team ${state === 'post' && c?.winner === false ? 'lost' : ''}`}>
      <Link to={`/nfl/team/${String(c?.team?.abbreviation).toLowerCase()}`}>
        <TeamLogo src={c?.team?.logos?.[0]?.href} size={56} />
        <div className="sh-name">{c?.team?.shortDisplayName || c?.team?.name}</div>
      </Link>
      <div className="sh-rec">{c?.record?.[0]?.summary || c?.record?.[0]?.displayValue}</div>
    </div>
  );

  return (
    <div className="score-header">
      <div className="sh-main">
        {side(ctx.away)}
        <div className="sh-mid">
          {state === 'pre' ? (
            <div className="sh-time">{fmtTime(comp.date)}</div>
          ) : (
            <div className="sh-score">
              <span>{ctx.away?.score}</span>
              <span className="dash">–</span>
              <span>{ctx.home?.score}</span>
            </div>
          )}
          <div className={`sh-status ${state === 'in' ? 'live' : ''}`}>{st?.type?.detail}</div>
          {state === 'in' && sit?.downDistanceText && <div className="sh-sit">{sit.downDistanceText}</div>}
        </div>
        {side(ctx.home)}
      </div>
      {state !== 'pre' && (
        <div className="table-wrap">
          <table className="linescore">
            <thead>
              <tr>
                <th className="l" />
                {Array.from({ length: periods }, (_, i) => (
                  <th key={i}>{i < 4 ? i + 1 : 'OT'}</th>
                ))}
                <th>T</th>
              </tr>
            </thead>
            <tbody>
              {[ctx.away, ctx.home].map((c) => (
                <tr key={c?.id}>
                  <td className="l">{c?.team?.abbreviation}</td>
                  {Array.from({ length: periods }, (_, i) => (
                    <td key={i}>{c?.linescores?.[i]?.displayValue ?? ''}</td>
                  ))}
                  <td className="em">{c?.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- shared ----------

/** Play text with every player name turned into a link. */
function PlayText({ ctx, text }: { ctx: Ctx; text: string }) {
  if (!ctx.nameRe) return <>{text}</>;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(ctx.nameRe)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    parts.push(<PlayerLink key={i} id={ctx.nameToId.get(m[1])} name={m[1]} />);
    last = i + m[1].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function NameLink({ ctx, name }: { ctx: Ctx; name?: string }) {
  if (!name) return null;
  return <PlayerLink id={ctx.nameToId.get(name)} name={name} />;
}

const abbrOf = (ctx: Ctx, teamId?: string) =>
  [ctx.home, ctx.away].find((c) => String(c?.team?.id) === String(teamId))?.team?.abbreviation as string | undefined;

function playTurnovers(ctx: Ctx, p: any): TurnoverInfo[] {
  const t = p.text || '';
  if (!p.isTurnover && !/FUMBLES|MUFFS|INTERCEPTED/.test(t)) return [];
  const offId = String(p.start?.team?.id || p._drive?.team?.id);
  const defId = [ctx.home, ctx.away].map((c) => String(c?.team?.id)).find((id) => id !== offId);
  return parseTurnovers(t, abbrOf(ctx, offId), abbrOf(ctx, defId));
}

// ---------- summary ----------

function SummaryTab({ ctx }: { ctx: Ctx }) {
  const d = ctx.d;
  const scoring: any[] = d.scoringPlays || [];
  const turnovers = ctx.plays.map((p) => ({ p, list: playTurnovers(ctx, p) })).filter((x) => x.list.length);
  const info = d.gameInfo || {};
  const comp = d.header?.competitions?.[0] || {};

  return (
    <div>
      <Section title="Scoring">
        {!scoring.length && <p className="muted">No scoring yet.</p>}
        <ul className="plays">
          {scoring.map((s) => (
            <li key={s.id} className="play scoring">
              <div className="play-meta">
                <TeamLogo id={String(s.team?.id)} size={20} />
                <span>
                  Q{s.period?.number} {s.clock?.displayValue}
                </span>
                <span className="tag">{s.type?.abbreviation || s.type?.text}</span>
                <span className="score-after">
                  {s.awayScore}–{s.homeScore}
                </span>
              </div>
              <div className="play-text">
                <PlayText ctx={ctx} text={s.text} />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Turnovers (${turnovers.reduce((n, x) => n + x.list.filter((t) => t.kind === 'interception' || t.lost).length, 0)})`}>
        {!turnovers.length && <p className="muted">No fumbles or interceptions.</p>}
        <TurnoverList ctx={ctx} items={turnovers} />
      </Section>

      <Section title="Game leaders">
        <div className="leaders-grid">
          {(d.leaders || []).map((team: any) => (
            <div key={team.team?.id} className="card">
              <TeamLink id={String(team.team?.id)} />
              {(team.leaders || []).map((cat: any) => {
                const top = cat.leaders?.[0];
                if (!top) return null;
                return (
                  <div key={cat.name} className="leader-row">
                    <span className="muted small">{cat.displayName}</span>
                    <PlayerLink id={top.athlete?.id} name={top.athlete?.displayName || top.athlete?.shortName} />
                    <span className="small">{top.displayValue}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Game info">
        <dl className="info">
          {info.venue && (
            <>
              <dt>Venue</dt>
              <dd>
                {info.venue.fullName}
                {info.venue.address?.city ? `, ${info.venue.address.city}` : ''}
                {info.venue.address?.state ? `, ${info.venue.address.state}` : ''}
              </dd>
            </>
          )}
          {comp.broadcasts?.length > 0 && (
            <>
              <dt>TV</dt>
              <dd>{comp.broadcasts.map((b: any) => b.media?.shortName || b.type?.shortName).filter(Boolean).join(', ')}</dd>
            </>
          )}
          {info.weather && (
            <>
              <dt>Weather</dt>
              <dd>{info.weather.temperature}°</dd>
            </>
          )}
          {info.attendance > 0 && (
            <>
              <dt>Attendance</dt>
              <dd>{Number(info.attendance).toLocaleString()}</dd>
            </>
          )}
        </dl>
      </Section>
    </div>
  );
}

function TurnoverList({ ctx, items }: { ctx: Ctx; items: { p: any; list: TurnoverInfo[] }[] }) {
  return (
    <ul className="plays">
      {items.map(({ p, list }) => (
        <li key={p.id} className="play turnover">
          <div className="play-meta">
            <TeamLogo id={String(p.start?.team?.id || p._drive?.team?.id)} size={20} />
            <span>
              Q{p.period?.number} {p.clock?.displayValue}
            </span>
            {list.map((t, i) => (
              <span key={i} className={`tag ${t.kind === 'interception' || t.lost ? 'bad' : 'ok'}`}>
                {t.kind === 'interception' ? 'INT' : t.lost ? 'Fumble lost' : t.lost === false ? 'Fumble, kept' : 'Fumble'}
              </span>
            ))}
          </div>
          {list.map((t, i) => (
            <div key={i} className="to-detail">
              {t.kind === 'interception' ? (
                <>
                  Intercepted by <NameLink ctx={ctx} name={t.interceptedBy} />
                  {t.passer && (
                    <>
                      , thrown by <NameLink ctx={ctx} name={t.passer} />
                    </>
                  )}
                  {t.intendedFor && (
                    <>
                      , intended for <NameLink ctx={ctx} name={t.intendedFor} />
                    </>
                  )}
                </>
              ) : (
                <>
                  {t.muffed ? 'Muff' : 'Fumble'}
                  {t.fumbledBy && (
                    <>
                      {' '}
                      by <NameLink ctx={ctx} name={t.fumbledBy} />
                    </>
                  )}
                  {t.forcedBy && t.forcedBy !== 'Aborted' && (
                    <>
                      {' · '}forced by <NameLink ctx={ctx} name={t.forcedBy} />
                    </>
                  )}
                  {t.forcedBy === 'Aborted' && ' · aborted snap'}
                  {t.recoveredBy && (
                    <>
                      {' · '}recovered by <NameLink ctx={ctx} name={t.recoveredBy} /> ({t.recoveredTeam})
                    </>
                  )}
                  {t.outOfBounds && ' · out of bounds'}
                </>
              )}
            </div>
          ))}
          <details>
            <summary className="small muted">Full play</summary>
            <div className="play-text small">
              <PlayText ctx={ctx} text={finalPlayText(p.text)} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

// ---------- box score ----------

const CAT_TITLES: Record<string, string> = {
  passing: 'Passing',
  rushing: 'Rushing',
  receiving: 'Receiving',
  defensive: 'Defense',
  interceptions: 'Interceptions',
  kickReturns: 'Kick returns',
  puntReturns: 'Punt returns',
  kicking: 'Kicking',
  punting: 'Punting',
};

// Tables that get each ball carrier's FUM / LOST columns, and the one that gets recoveries.
const CARRIER_CATS = ['passing', 'rushing', 'receiving', 'kickReturns', 'puntReturns'];
const RECOVERY_CAT = 'defensive';

function BoxTab({ ctx }: { ctx: Ctx }) {
  const teams: any[] = ctx.d.boxscore?.players || [];
  const awayId = String(ctx.away?.team?.id);
  const ordered = [...teams].sort((a) => (String(a.team?.id) === awayId ? -1 : 1));
  const [side, setSide] = useState<string>(String(ordered[0]?.team?.id || ''));
  const team = ordered.find((t) => String(t.team?.id) === side) || ordered[0];
  if (!team) return <p className="muted">Box score shows up once the game starts.</p>;

  const cats: any[] = team.statistics || [];
  // ESPN puts fumbles in their own table (FUM, LOST, REC). Fold them into the tables above instead.
  const fumCat = cats.find((c) => c.name === 'fumbles');
  const fl: string[] = fumCat?.labels || [];
  const iFum = fl.indexOf('FUM');
  const iLost = fl.indexOf('LOST');
  const iRec = fl.indexOf('REC');
  const fum = new Map<string, string[]>();
  for (const a of fumCat?.athletes || []) fum.set(String(a.athlete?.id), a.stats || []);
  const pick = (id: string, i: number) => (i >= 0 ? fum.get(id)?.[i] ?? '0' : '');

  const inCarrierTable = new Set<string>();
  for (const c of cats) if (CARRIER_CATS.includes(c.name)) for (const a of c.athletes || []) inCarrierTable.add(String(a.athlete?.id));
  // Anyone who fumbled but isn't in a carrier table (a snapper, a defender after a takeaway) still gets listed.
  const others = (fumCat?.athletes || []).filter((a: any) => !inCarrierTable.has(String(a.athlete?.id)) && Number(a.stats?.[iFum] || 0) > 0);

  const extraCols = (catName: string) => {
    if (!fumCat) return [];
    const id = (a: any) => String(a.athlete?.id);
    if (CARRIER_CATS.includes(catName))
      return [
        { key: 'fum', label: 'FUM', title: 'Fumbles (all plays this game)', value: (a: any) => Number(pick(id(a), iFum)), render: (a: any) => pick(id(a), iFum) },
        { key: 'lost', label: 'LOST', title: 'Fumbles lost', value: (a: any) => Number(pick(id(a), iLost)), render: (a: any) => pick(id(a), iLost) },
      ];
    if (catName === RECOVERY_CAT && iRec >= 0)
      return [{ key: 'rec', label: 'FR', title: 'Fumbles recovered', value: (a: any) => Number(pick(id(a), iRec)), render: (a: any) => pick(id(a), iRec) }];
    return [];
  };

  return (
    <div>
      <Chips options={ordered.map((t) => ({ v: String(t.team?.id), label: t.team?.displayName }))} value={side} onChange={setSide} />
      {cats.map((cat: any) => {
        if (cat.name === 'fumbles') return null;
        const labels: string[] = cat.labels || [];
        if (!cat.athletes?.length) return null;
        const extra = extraCols(cat.name);
        // Put fumbles right after INT (passing) or TD so they're visible without swiping on a phone.
        const base = labels.map((l, i) => ({ key: `s${i}`, label: l, title: cat.descriptions?.[i], value: (a: any) => a.stats?.[i], render: (a: any) => a.stats?.[i] }));
        const anchor = labels.includes('INT') ? labels.indexOf('INT') : labels.indexOf('TD');
        const at = extra.length && anchor >= 0 ? anchor + 1 : base.length;
        const statCols = [...base.slice(0, at), ...extra, ...base.slice(at)];
        const totals = cat.totals?.length ? [...cat.totals.slice(0, at), ...extra.map(() => ''), ...cat.totals.slice(at)] : null;
        return (
          <Section key={cat.name} title={CAT_TITLES[cat.name] || cat.text || cat.name}>
            <StatTable
              dense
              rows={cat.athletes}
              rowKey={(a: any, i) => `${a.athlete?.id}-${i}`}
              cols={[
                { key: 'name', label: 'Player', left: true, value: (a: any) => a.athlete?.displayName, render: (a: any) => <PlayerLink id={a.athlete?.id} name={a.athlete?.displayName} /> },
                ...statCols,
              ]}
              totals={totals ? ['Team', ...totals] : undefined}
            />
          </Section>
        );
      })}
      {others.length > 0 && (
        <Section title="Other fumbles">
          <StatTable
            dense
            rows={others}
            rowKey={(a: any) => String(a.athlete?.id)}
            cols={[
              { key: 'name', label: 'Player', left: true, render: (a: any) => <PlayerLink id={a.athlete?.id} name={a.athlete?.displayName} /> },
              ...fl.map((l, i) => ({ key: `f${i}`, label: l, render: (a: any) => a.stats?.[i] })),
            ]}
          />
        </Section>
      )}
      {fumCat?.totals && (
        <p className="small muted">
          Team fumbles: {fumCat.totals[iFum]} · lost: {fumCat.totals[iLost]}. A player's FUM counts every play, so a QB who fumbles shows it in both Passing and
          Rushing.
        </p>
      )}
    </div>
  );
}

// ---------- plays ----------

type Filter = 'all' | 'scoring' | 'turnovers' | 'penalties' | 'big';

function PlaysTab({ ctx }: { ctx: Ctx }) {
  const [filter, setFilter] = useState<Filter>('all');
  const live = statusState(ctx.d.header?.competitions?.[0]?.status) === 'in';
  const [newestFirst, setNewestFirst] = useState(live);

  const keep = (p: any) => {
    const type = p.type?.text || '';
    if (filter === 'scoring') return p.scoringPlay;
    if (filter === 'turnovers') return playTurnovers(ctx, p).length > 0;
    if (filter === 'penalties') return p.isPenalty || /PENALTY/.test(p.text || '');
    if (filter === 'big') return Math.abs(p.statYardage || 0) >= 20 && !/Kickoff|Punt/.test(type);
    return true;
  };

  const drives: any[] = [...(ctx.d.drives?.previous || [])];
  if (ctx.d.drives?.current && !drives.some((x) => x.id === ctx.d.drives.current.id)) drives.push(ctx.d.drives.current);
  const order = <T,>(xs: T[]) => (newestFirst ? [...xs].reverse() : xs);

  return (
    <div>
      <Chips<Filter>
        options={[
          { v: 'all', label: 'All plays' },
          { v: 'scoring', label: 'Scoring' },
          { v: 'turnovers', label: 'Turnovers' },
          { v: 'penalties', label: 'Penalties' },
          { v: 'big', label: 'Big plays (20+)' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <label className="toggle small">
        <input type="checkbox" checked={newestFirst} onChange={(e) => setNewestFirst(e.target.checked)} /> Newest first
      </label>

      {!drives.length && <p className="muted">No plays yet.</p>}

      {filter === 'all'
        ? order(drives).map((dr) => <DriveBlock key={dr.id} ctx={ctx} drive={dr} newestFirst={newestFirst} open={dr === ctx.d.drives?.current} />)
        : (() => {
            const list = order(ctx.plays.filter(keep));
            if (!list.length) return <p className="muted">None.</p>;
            if (filter === 'turnovers') return <TurnoverList ctx={ctx} items={list.map((p) => ({ p, list: playTurnovers(ctx, p) }))} />;
            return (
              <ul className="plays">
                {list.map((p) => (
                  <PlayRow key={p.id} ctx={ctx} p={p} showTeam />
                ))}
              </ul>
            );
          })()}
    </div>
  );
}

function DriveBlock({ ctx, drive, newestFirst, open }: { ctx: Ctx; drive: any; newestFirst: boolean; open?: boolean }) {
  const plays: any[] = drive.plays || [];
  const result = drive.displayResult || drive.result || (open ? 'In progress' : '');
  const good = drive.isScore;
  const bad = /Fumble|Interception|Downs|Safety/i.test(result);
  return (
    <details className="drive" open={open}>
      <summary>
        <TeamLogo id={String(drive.team?.id)} size={22} />
        <div className="drive-sum">
          <b className={good ? 'good' : bad ? 'bad' : ''}>{result}</b>
          <span className="muted small">
            {drive.description} · Q{drive.start?.period?.number} {drive.start?.clock?.displayValue} · from {drive.start?.text}
          </span>
        </div>
      </summary>
      <ul className="plays">
        {(newestFirst ? [...plays].reverse() : plays).map((p) => (
          <PlayRow key={p.id} ctx={ctx} p={{ ...p, _drive: drive }} />
        ))}
      </ul>
    </details>
  );
}

function PlayRow({ ctx, p, showTeam }: { ctx: Ctx; p: any; showTeam?: boolean }) {
  const tos = playTurnovers(ctx, p);
  const cls = p.scoringPlay ? 'scoring' : tos.length ? 'turnover' : p.isPenalty ? 'penalty' : '';
  return (
    <li className={`play ${cls}`}>
      <div className="play-meta">
        {showTeam && <TeamLogo id={String(p.start?.team?.id || p._drive?.team?.id)} size={18} />}
        <span>
          Q{p.period?.number} {p.clock?.displayValue}
        </span>
        {p.start?.down > 0 && <span>{p.start.downDistanceText}</span>}
        {p.scoringPlay && <span className="tag ok">{p.type?.abbreviation || 'Score'}</span>}
        {tos.map((t, i) => (
          <span key={i} className={`tag ${t.kind === 'interception' || t.lost ? 'bad' : 'ok'}`}>
            {t.kind === 'interception' ? 'INT' : t.lost ? 'Fumble lost' : 'Fumble'}
          </span>
        ))}
        {p.isPenalty && <span className="tag warn">Flag</span>}
        {p.scoringPlay && (
          <span className="score-after">
            {p.awayScore}–{p.homeScore}
          </span>
        )}
      </div>
      <div className="play-text">
        <PlayText ctx={ctx} text={p.text || p.type?.text || ''} />
      </div>
      {tos.length > 0 && (
        <div className="to-detail small">
          {tos.map((t, i) => (
            <div key={i}>{describeTurnover(t)}</div>
          ))}
        </div>
      )}
    </li>
  );
}

// ---------- team stats ----------

function TeamStatsTab({ ctx }: { ctx: Ctx }) {
  const teams: any[] = ctx.d.boxscore?.teams || [];
  const away = teams.find((t) => t.homeAway === 'away') || teams[0];
  const home = teams.find((t) => t.homeAway === 'home') || teams[1];
  if (!away || !home) return <p className="muted">Team stats show up once the game starts.</p>;

  // ESPN's team box only has "fumbles lost"; total fumbles comes from the player fumble table.
  const fumbleTotals = (teamId: string) => {
    const p = (ctx.d.boxscore?.players || []).find((x: any) => String(x.team?.id) === String(teamId));
    const cat = p?.statistics?.find((c: any) => c.name === 'fumbles');
    return cat?.totals?.[0] ?? '0';
  };

  const seen = new Set<string>();
  const rows: { label: string; a: string; h: string; key: string }[] = [];
  for (const s of away.statistics || []) {
    if (seen.has(s.name)) continue; // ESPN lists "interceptions" twice
    seen.add(s.name);
    rows.push({ key: s.name, label: s.label || s.name, a: s.displayValue, h: stat(home.statistics, s.name) ?? '' });
    if (s.name === 'turnovers') rows.push({ key: 'fumblesTotal', label: 'Fumbles (total)', a: fumbleTotals(away.team?.id), h: fumbleTotals(home.team?.id) });
  }
  const sections: [string, string[]][] = [
    ['Offense', ['firstDowns', 'firstDownsPassing', 'firstDownsRushing', 'firstDownsPenalty', 'totalOffensivePlays', 'totalYards', 'yardsPerPlay', 'totalDrives']],
    ['Passing', ['netPassingYards', 'completionAttempts', 'yardsPerPass', 'sacksYardsLost']],
    ['Rushing', ['rushingYards', 'rushingAttempts', 'yardsPerRushAttempt']],
    ['Situational', ['thirdDownEff', 'fourthDownEff', 'redZoneAttempts', 'possessionTime']],
    ['Turnovers', ['turnovers', 'fumblesTotal', 'fumblesLost', 'interceptions', 'defensiveTouchdowns']],
    ['Penalties', ['totalPenaltiesYards']],
  ];
  const used = new Set(sections.flatMap(([, k]) => k));
  const extra = rows.filter((r) => !used.has(r.key));

  const better = (key: string, a: string, h: string): 'a' | 'h' | null => {
    const n = (s: string) => Number(String(s).split(/[-/]/)[0].replace(/[,:]/g, ''));
    const lowerIsBetter = ['turnovers', 'fumblesTotal', 'fumblesLost', 'interceptions', 'totalPenaltiesYards', 'sacksYardsLost'].includes(key);
    const x = n(a);
    const y = n(h);
    if (Number.isNaN(x) || Number.isNaN(y) || x === y) return null;
    return (x > y) !== lowerIsBetter ? 'a' : 'h';
  };

  const block = (title: string, keys: string[] | null) => {
    const list = keys ? keys.map((k) => rows.find((r) => r.key === k)).filter(Boolean) : extra;
    if (!list.length) return null;
    return (
      <Fragment key={title}>
        <tr className="group">
          <td colSpan={3}>{title}</td>
        </tr>
        {list.map((r) => {
          const b = better(r!.key, r!.a, r!.h);
          return (
            <tr key={r!.key}>
              <td className={b === 'a' ? 'em' : ''}>{r!.a}</td>
              <td className="mid">{r!.label}</td>
              <td className={b === 'h' ? 'em' : ''}>{r!.h}</td>
            </tr>
          );
        })}
      </Fragment>
    );
  };

  return (
    <div className="table-wrap">
      <table className="versus">
        <thead>
          <tr>
            <th>
              <TeamLink id={String(away.team?.id)} label="abbr" />
            </th>
            <th />
            <th>
              <TeamLink id={String(home.team?.id)} label="abbr" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sections.map(([t, k]) => block(t, k))}
          {block('Other', null)}
        </tbody>
      </table>
    </div>
  );
}

// ---------- win probability ----------

function WinProbTab({ ctx }: { ctx: Ctx }) {
  const wp: any[] = ctx.d.winprobability || [];
  const league = useLeague();
  if (wp.length < 2) return <p className="muted">Win probability shows up once the game starts.</p>;
  const homeT = league.byId[String(ctx.home?.team?.id)];
  const awayT = league.byId[String(ctx.away?.team?.id)];
  const W = 600;
  const H = 220;
  // Top half = away team winning, bottom half = home team winning.
  const pts = wp.map((p, i) => [(i / (wp.length - 1)) * W, p.homeWinPercentage * H] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const lastHome = wp[wp.length - 1].homeWinPercentage;

  // Mark turnovers and scores on the chart.
  const indexOfPlay = new Map(wp.map((p, i) => [String(p.playId), i]));
  const marks = ctx.plays
    .filter((p) => p.scoringPlay || playTurnovers(ctx, p).some((t) => t.kind === 'interception' || t.lost))
    .map((p) => ({ i: indexOfPlay.get(String(p.id)), score: p.scoringPlay }))
    .filter((m) => m.i != null);

  return (
    <div>
      <div className="wp-now">
        <span>
          {ctx.away?.team?.abbreviation} <b>{Math.round((1 - lastHome) * 100)}%</b>
        </span>
        <span>
          {ctx.home?.team?.abbreviation} <b>{Math.round(lastHome * 100)}%</b>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="wp-chart" preserveAspectRatio="none" role="img" aria-label="Win probability over the game">
        <rect x="0" y="0" width={W} height={H / 2} className="wp-bg-away" />
        <rect x="0" y={H / 2} width={W} height={H / 2} className="wp-bg-home" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="wp-mid" />
        {marks.map((m, k) => (
          <line key={k} x1={pts[m.i!][0]} x2={pts[m.i!][0]} y1="0" y2={H} className={m.score ? 'wp-mark-score' : 'wp-mark-to'} />
        ))}
        <path d={line} className="wp-line" />
      </svg>
      <div className="wp-legend small muted">
        <span>Top half: {awayT?.short} ahead</span>
        <span>Bottom half: {homeT?.short} ahead</span>
      </div>
      <p className="small muted">Gold lines are scores, red lines are turnovers. Probability is ESPN's model.</p>
    </div>
  );
}
