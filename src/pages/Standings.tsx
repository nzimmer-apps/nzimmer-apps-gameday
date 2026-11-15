import { Link, Navigate, useParams } from 'react-router-dom';
import { GameCard } from '../components/GameCard';
import { Chips, Crumbs, Loading, Section, StatTable, TeamLink, cap, useTab } from '../components/ui';
import { urls } from '../lib/espn';
import { useEspn, useSettings } from '../lib/hooks';
import { DIV_KEYS, divisionEntries, entryStat, useLeague } from '../lib/league';

const num = (e: any, n: string) => Number(entryStat(e, n)) || 0;

export function StandingsTable({ entries, hlId, seed, compact }: { entries: any[]; hlId?: string; seed?: boolean; compact?: boolean }) {
  const { favorites } = useSettings();
  const cols = [
    ...(seed ? [{ key: 'seed', label: '#', value: (e: any) => -num(e, 'playoffSeed'), render: (e: any) => entryStat(e, 'playoffSeed') }] : []),
    { key: 'team', label: 'Team', left: true, value: (e: any) => e.team?.displayName, render: (e: any) => <TeamLink id={String(e.team?.id)} /> },
    { key: 'w', label: 'W', value: (e: any) => num(e, 'wins'), render: (e: any) => entryStat(e, 'wins') },
    { key: 'l', label: 'L', value: (e: any) => num(e, 'losses'), render: (e: any) => entryStat(e, 'losses') },
    { key: 't', label: 'T', value: (e: any) => num(e, 'ties'), render: (e: any) => entryStat(e, 'ties') },
    { key: 'pct', label: 'PCT', highlight: true, value: (e: any) => num(e, 'winPercent'), render: (e: any) => entryStat(e, 'winPercent') },
    ...(compact
      ? []
      : [
          { key: 'pf', label: 'PF', value: (e: any) => num(e, 'pointsFor'), render: (e: any) => entryStat(e, 'pointsFor') },
          { key: 'pa', label: 'PA', value: (e: any) => num(e, 'pointsAgainst'), render: (e: any) => entryStat(e, 'pointsAgainst') },
        ]),
    { key: 'diff', label: 'DIFF', value: (e: any) => num(e, 'pointDifferential'), render: (e: any) => entryStat(e, 'pointDifferential') },
    { key: 'strk', label: 'STRK', render: (e: any) => entryStat(e, 'streak') },
    ...(compact
      ? []
      : [
          { key: 'div', label: 'DIV', value: (e: any) => entryStat(e, 'divisionRecord'), render: (e: any) => entryStat(e, 'divisionRecord') },
          { key: 'home', label: 'HOME', value: (e: any) => entryStat(e, 'Home'), render: (e: any) => entryStat(e, 'Home') },
          { key: 'road', label: 'AWAY', value: (e: any) => entryStat(e, 'Road'), render: (e: any) => entryStat(e, 'Road') },
        ]),
  ];
  return (
    <StatTable
      dense
      rows={entries}
      rowKey={(e: any) => String(e.team?.id)}
      hl={(e: any) => String(e.team?.id) === hlId || favorites.includes(e.team?.abbreviation)}
      cols={cols}
    />
  );
}

function allEntries(standings: any, conf?: string): any[] {
  return (standings?.children || [])
    .filter((c: any) => !conf || String(c.abbreviation).toLowerCase() === conf)
    .flatMap((c: any) => (c.children || []).flatMap((d: any) => d.standings?.entries || []));
}

/** #/nfl — whole league, with Division / Conference / League views. */
export function LeagueHome() {
  const league = useLeague();
  const [view, setView] = useTab(['division', 'conference', 'league']);
  if (!league.standings) return <Loading what="Loading standings" />;
  const st = league.standings;

  return (
    <div>
      <nav className="crumbs">
        <span aria-current="page">NFL</span>
      </nav>
      <h1 className="page-title">NFL Standings</h1>
      <div className="quick-links">
        <Link to="/nfl/afc">AFC</Link>
        <Link to="/nfl/nfc">NFC</Link>
        <Link to="/nfl/leaders">Stat leaders</Link>
        <Link to="/">Scores</Link>
      </div>
      <Chips
        options={[
          { v: 'division', label: 'Division' },
          { v: 'conference', label: 'Conference' },
          { v: 'league', label: 'League' },
        ]}
        value={view as 'division'}
        onChange={setView}
      />
      {view === 'division' &&
        (['afc', 'nfc'] as const).map((conf) => (
          <div key={conf}>
            <h2 className="conf-head">
              <Link to={`/nfl/${conf}`}>{conf.toUpperCase()}</Link>
            </h2>
            {DIV_KEYS.map((div) => (
              <Section key={div} title={<Link to={`/nfl/${conf}/${div}`}>{`${conf.toUpperCase()} ${cap(div)}`}</Link>}>
                <StandingsTable entries={divisionEntries(st, conf, div)} compact />
              </Section>
            ))}
          </div>
        ))}
      {view === 'conference' &&
        (['afc', 'nfc'] as const).map((conf) => (
          <Section key={conf} title={<Link to={`/nfl/${conf}`}>{conf.toUpperCase()}</Link>}>
            <StandingsTable entries={allEntries(st, conf).sort((a, b) => num(a, 'playoffSeed') - num(b, 'playoffSeed'))} seed />
          </Section>
        ))}
      {view === 'league' && (
        <Section title="All 32 teams">
          <StandingsTable entries={allEntries(st).sort((a, b) => num(b, 'winPercent') - num(a, 'winPercent') || num(b, 'pointDifferential') - num(a, 'pointDifferential'))} />
        </Section>
      )}
    </div>
  );
}

/** #/nfl/afc */
export function Conference() {
  const { conf = '' } = useParams();
  const league = useLeague();
  if (conf !== 'afc' && conf !== 'nfc') return <Navigate to="/nfl" replace />;
  if (!league.standings) return <Loading what="Loading standings" />;
  const entries = allEntries(league.standings, conf).sort((a, b) => num(a, 'playoffSeed') - num(b, 'playoffSeed'));
  return (
    <div>
      <Crumbs items={[{ label: conf.toUpperCase() }]} />
      <h1 className="page-title">{conf === 'afc' ? 'American' : 'National'} Football Conference</h1>
      <div className="quick-links">
        {DIV_KEYS.map((d) => (
          <Link key={d} to={`/nfl/${conf}/${d}`}>
            {conf.toUpperCase()} {cap(d)}
          </Link>
        ))}
      </div>
      <Section title="Playoff picture">
        <p className="small muted">Seeds 1–7 make the playoffs. Division leaders take seeds 1–4.</p>
        <StandingsTable entries={entries} seed />
      </Section>
      {DIV_KEYS.map((div) => (
        <Section key={div} title={<Link to={`/nfl/${conf}/${div}`}>{`${conf.toUpperCase()} ${cap(div)}`}</Link>}>
          <StandingsTable entries={divisionEntries(league.standings, conf, div)} compact />
        </Section>
      ))}
    </div>
  );
}

/** #/nfl/nfc/north */
export function Division() {
  const { conf = '', div = '' } = useParams();
  const league = useLeague();
  const sb = useEspn(urls.scoreboard(), 60_000);
  if (!league.standings) return <Loading what="Loading standings" />;
  const entries = divisionEntries(league.standings, conf, div);
  if (!entries.length) return <Navigate to="/nfl" replace />;
  const ids = new Set(entries.map((e) => String(e.team?.id)));
  const games = (sb.data?.events || []).filter((e: any) => e.competitions?.[0]?.competitors?.some((c: any) => ids.has(String(c.team?.id))));

  return (
    <div>
      <Crumbs items={[{ to: `/nfl/${conf}`, label: conf.toUpperCase() }, { label: `${conf.toUpperCase()} ${cap(div)}` }]} />
      <h1 className="page-title">
        {conf.toUpperCase()} {cap(div)}
      </h1>
      <StandingsTable entries={entries} />
      <div className="team-tiles">
        {entries.map((e) => {
          const t = league.byId[String(e.team?.id)];
          return (
            <Link key={e.team?.id} to={`/nfl/team/${t?.slug}`} className="team-tile" style={{ borderColor: t?.color }}>
              <img src={t?.logo} alt="" width={48} height={48} />
              <b>{t?.short}</b>
              <span className="small muted">{entryStat(e, 'overall')}</span>
            </Link>
          );
        })}
      </div>
      {games.length > 0 && (
        <Section title={`This week · Week ${sb.data?.week?.number}`}>
          <div className="games">
            {games.map((e: any) => (
              <GameCard key={e.id} event={e} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
