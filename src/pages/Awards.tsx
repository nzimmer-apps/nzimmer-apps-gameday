import { Link } from 'react-router-dom';
import { Crumbs, ErrorBox, Loading, PlayerLink, TeamLink } from '../components/ui';
import {
  defenseScore,
  impliedProb,
  mergeAthletes,
  offenseScore,
  rank,
  readByAthlete,
  rookieInfo,
  rookieSeason,
  statLine,
  type Athlete,
  type Ranked,
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

export function Awards() {
  const league = useLeague();
  const year: number | undefined = league.standings?.season?.year;
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

  const failed = qs.find((q) => q.error && !q.data);
  if (failed) return <ErrorBox error={failed.error!} retry={failed.reload} />;
  if (!year || qs.some((q) => !q.data)) return <Loading what="Loading the award race" />;

  const [pass, rush, recv, sacks, ints, tkl] = qs.map((q) => readByAthlete(q.data));
  const offense = mergeAthletes(pass, rush, recv);
  const defense = mergeAthletes(sacks, ints, tkl);
  const everyone = mergeAthletes(offense, defense);
  const isRookie = (a: Athlete) => rookieSeason === year && !!rookieInfo(a.id);

  const mvpMarket = (fut.data?.items || []).find((it: any) => /MVP/i.test(it.name || ''));
  const mvpBook: { id: string; odds: string }[] = (mvpMarket?.futures?.[0]?.books || [])
    .map((b: any) => ({ id: String(b.athlete?.$ref || '').match(/athletes\/(\d+)/)?.[1] || '', odds: String(b.value) }))
    .filter((b: { id: string }) => b.id)
    .slice(0, 8);

  return (
    <div>
      <Crumbs items={[{ label: 'Award race' }]} />
      <h1 className="page-title">{year} award race</h1>
      <LeaderTabs on="awards" />
      <p className="small muted">Projected winners if the season ended today. Tap any player for their stats.</p>

      <AwardCard
        title="Most Valuable Player"
        how={
          mvpBook.length
            ? `Ranked by DraftKings odds (via ESPN). The percentage is the chance those odds imply.`
            : `No odds available right now, so this ranks quarterbacks by the offense score below.`
        }
      >
        {mvpBook.length
          ? mvpBook.map((b, i) => <MvpRow key={b.id} rank={i + 1} id={b.id} odds={b.odds} known={everyone.find((a) => a.id === b.id)} />)
          : rank(pass, offenseScore).map((r, i) => <Row key={r.a.id} rank={i + 1} r={r} />)}
      </AwardCard>

      <AwardCard title="Offensive Player of the Year" how="Non-quarterbacks ranked by offense score (QBs are covered by MVP). Score: 1 pt per 10 rushing or receiving yards, 6 per TD, 0.5 per catch, -2 per fumble lost.">
        {rank(offense, offenseScore, (a) => a.pos !== 'QB').map((r, i) => (
          <Row key={r.a.id} rank={i + 1} r={r} />
        ))}
      </AwardCard>

      <AwardCard
        title="Defensive Player of the Year"
        how="Score: 4 per sack, 5 per interception, 4 per forced fumble, 2 per fumble recovery, 6 per defensive TD, 1 per tackle for loss, 1 per pass defended, 0.2 per tackle."
      >
        {rank(defense, defenseScore).map((r, i) => (
          <Row key={r.a.id} rank={i + 1} r={r} />
        ))}
      </AwardCard>

      <AwardCard
        title="Offensive Rookie of the Year"
        how={`${year} draft picks ranked by offense score, quarterbacks included: 1 pt per 25 passing yards, 4 per passing TD, -2 per INT, plus the rushing and receiving points above.`}
      >
        {rookieSeason === year ? (
          rank(offense, offenseScore, isRookie).map((r, i) => <Row key={r.a.id} rank={i + 1} r={r} rookie />)
        ) : (
          <p className="muted small">The rookie list is from the {rookieSeason} draft; it needs updating for {year}.</p>
        )}
      </AwardCard>

      <AwardCard title="Defensive Rookie of the Year" how={`${year} draft picks ranked by the defense score above.`}>
        {rookieSeason === year ? (
          rank(defense, defenseScore, isRookie).map((r, i) => <Row key={r.a.id} rank={i + 1} r={r} rookie />)
        ) : (
          <p className="muted small">The rookie list is from the {rookieSeason} draft; it needs updating for {year}.</p>
        )}
      </AwardCard>

      <p className="small muted">
        Comeback Player and Coach of the Year aren't projected: they depend on things the stats don't show, like last season's injuries or a new
        coaching staff. Rookies are players drafted in {rookieSeason}; undrafted rookies aren't included.
      </p>
    </div>
  );
}

function AwardCard({ title, how, children }: { title: string; how: string; children: React.ReactNode }) {
  return (
    <section className="award card">
      <h2>{title}</h2>
      <ol className="award-list">{children}</ol>
      <details>
        <summary className="small muted">How it's projected</summary>
        <p className="small muted">{how}</p>
      </details>
    </section>
  );
}

function PlayerBits({ a, rookie }: { a: Athlete; rookie?: boolean }) {
  const r = rookie ? rookieInfo(a.id) : undefined;
  return (
    <div className="aw-who">
      <div className="aw-name">
        <PlayerLink id={a.id} name={a.name} />
        <span className="small muted"> {a.pos}</span>
        {a.teamId && (
          <span className="aw-team">
            <TeamLink id={a.teamId} label="abbr" size={16} />
          </span>
        )}
      </div>
      <div className="small muted">
        {statLine(a)}
        {r ? ` · Rd ${r.round}, #${r.overall} overall` : ''}
      </div>
    </div>
  );
}

function Row({ rank: n, r, rookie }: { rank: number; r: Ranked; rookie?: boolean }) {
  return (
    <li className={n === 1 ? 'aw-row lead' : 'aw-row'}>
      <span className="aw-rank">{n}</span>
      {r.a.headshot ? <img className="aw-face" src={r.a.headshot} alt="" loading="lazy" /> : <span className="aw-face" />}
      <PlayerBits a={r.a} rookie={rookie} />
      <span className="aw-val">
        <b>{r.score.toFixed(0)}</b>
        <span className="small muted">pts</span>
      </span>
    </li>
  );
}

/** MVP row: the odds name a player by id; if they aren't in the loaded stat lists, load their page once. */
function MvpRow({ rank: n, id, odds, known }: { rank: number; id: string; odds: string; known?: Athlete }) {
  const q = useEspn(known ? null : urls.athlete(id), TEN_MIN);
  const a: Athlete | undefined =
    known ||
    (q.data?.athlete
      ? {
          id,
          name: q.data.athlete.displayName,
          short: q.data.athlete.shortName,
          pos: q.data.athlete.position?.abbreviation || '',
          teamId: q.data.athlete.team?.id ? String(q.data.athlete.team.id) : undefined,
          headshot: q.data.athlete.headshot?.href,
          stats: {},
        }
      : undefined);
  const p = impliedProb(odds);
  return (
    <li className={n === 1 ? 'aw-row lead' : 'aw-row'}>
      <span className="aw-rank">{n}</span>
      {a?.headshot ? <img className="aw-face" src={a.headshot} alt="" loading="lazy" /> : <span className="aw-face" />}
      {a ? <PlayerBits a={a} /> : <div className="aw-who muted small">Loading…</div>}
      <span className="aw-val">
        <b>{odds}</b>
        {p != null && <span className="small muted">{Math.round(p * 100)}%</span>}
      </span>
    </li>
  );
}
