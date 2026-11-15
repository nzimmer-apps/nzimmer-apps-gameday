import { Link, useParams } from 'react-router-dom';
import { Crumbs, ErrorBox, Loading, PlayerLink, Section, StatTable, Tabs, TeamLink, fmtDate, fmtTime, teamCrumbs, useTab } from '../components/ui';
import { statusState, urls } from '../lib/espn';
import { toggleFavorite, useEspn, useSettings } from '../lib/hooks';
import { divisionEntries, entryStat, useLeague } from '../lib/league';
import { StandingsTable } from './Standings';

const TABS = ['schedule', 'roster', 'stats', 'division'];

export function Team() {
  const { abbr = '' } = useParams();
  const league = useLeague();
  const t = league.byAbbr[abbr.toUpperCase()];
  const [tab, setTab] = useTab(TABS);
  const { favorites } = useSettings();

  if (!league.ready) return <Loading />;
  if (!t) return <p className="muted">No team "{abbr}". <Link to="/nfl">All teams</Link></p>;
  const fav = favorites.includes(t.abbr);
  // Record and division place come from standings: ESPN's single-team endpoint sends no CORS header.
  const divEntries = t.conf && t.div ? divisionEntries(league.standings, t.conf, t.div) : [];
  const place = divEntries.findIndex((e) => String(e.team?.id) === t.id);
  const record = place >= 0 ? entryStat(divEntries[place], 'overall') : '';
  const ord = (n: number) => ['1st', '2nd', '3rd', '4th'][n] || `${n + 1}th`;

  return (
    <div>
      <Crumbs items={teamCrumbs(t.id, league, false)} />
      <div className="team-header" style={{ background: `linear-gradient(135deg, ${t.color}, ${t.color}cc)` }}>
        <img src={t.logo} alt="" width={72} height={72} />
        <div>
          <h1>{t.name}</h1>
          <div className="th-sub">
            {record}
            {place >= 0 && t.conf && t.div ? ` · ${ord(place)} in ${t.conf.toUpperCase()} ${t.div[0].toUpperCase() + t.div.slice(1)}` : ''}
          </div>
          {t.conf && t.div && (
            <Link className="th-div" to={`/nfl/${t.conf}/${t.div}`}>
              {t.conf.toUpperCase()} {t.div[0].toUpperCase() + t.div.slice(1)} ›
            </Link>
          )}
        </div>
        <button className={`star ${fav ? 'on' : ''}`} onClick={() => toggleFavorite(t.abbr)} aria-label={fav ? 'Remove from my teams' : 'Add to my teams'}>
          {fav ? '★' : '☆'}
        </button>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'schedule' && <Schedule teamId={t.id} />}
      {tab === 'roster' && <Roster teamId={t.id} />}
      {tab === 'stats' && <TeamSeasonStats teamId={t.id} />}
      {tab === 'division' && t.conf && t.div && <StandingsTable entries={divisionEntries(league.standings, t.conf, t.div)} hlId={t.id} />}
    </div>
  );
}

function Schedule({ teamId }: { teamId: string }) {
  const q = useEspn(urls.schedule(teamId));
  if (q.error && !q.data) return <ErrorBox error={q.error} retry={q.reload} />;
  if (!q.data) return <Loading what="Loading schedule" />;
  const events: any[] = q.data.events || [];
  const bye = q.data.byeWeek;

  const rows: any[] = [];
  events.forEach((e) => {
    if (bye && e.week?.number > bye && !rows.some((r) => r.bye)) rows.push({ bye: true, week: bye });
    rows.push(e);
  });

  return (
    <ul className="schedule">
      {rows.map((e, i) => {
        if (e.bye)
          return (
            <li key={`bye${i}`} className="sched-row bye-row">
              <span className="wk">W{e.week}</span>
              <span className="muted">Bye week</span>
            </li>
          );
        const c = e.competitions?.[0] || {};
        const me = c.competitors?.find((x: any) => String(x.team?.id) === teamId);
        const opp = c.competitors?.find((x: any) => String(x.team?.id) !== teamId);
        const state = statusState(c.status);
        const score = (x: any) => x?.score?.displayValue ?? x?.score;
        const res = state === 'post' ? (me?.winner ? 'W' : opp?.winner ? 'L' : 'T') : '';
        return (
          <li key={e.id} className="sched-row">
            <span className="wk">{e.week?.number ? `W${e.week.number}` : e.week?.text}</span>
            <span className="at">{me?.homeAway === 'home' ? 'vs' : '@'}</span>
            <span className="opp">
              <TeamLink id={String(opp?.team?.id)} />
            </span>
            <Link to={`/nfl/game/${e.id}`} className={`res ${res}`}>
              {state === 'post' ? (
                <>
                  <b>{res}</b> {score(me)}-{score(opp)}
                </>
              ) : state === 'in' ? (
                <span className="live">LIVE {score(me)}-{score(opp)}</span>
              ) : (
                <span className="muted">{e.timeValid === false ? fmtDate(e.date) : fmtTime(e.date)}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const GROUP_TITLES: Record<string, string> = {
  offense: 'Offense',
  defense: 'Defense',
  specialTeam: 'Special teams',
  injuredReserveOrOut: 'Injured reserve / out',
  suspended: 'Suspended',
  practiceSquad: 'Practice squad',
};

function Roster({ teamId }: { teamId: string }) {
  const q = useEspn(urls.roster(teamId));
  if (q.error && !q.data) return <ErrorBox error={q.error} retry={q.reload} />;
  if (!q.data) return <Loading what="Loading roster" />;
  return (
    <div>
      {(q.data.athletes || []).map((g: any) =>
        g.items?.length ? (
          <Section key={g.position} title={GROUP_TITLES[g.position] || g.position}>
            <StatTable
              dense
              rows={g.items}
              rowKey={(a: any) => String(a.id)}
              cols={[
                { key: 'no', label: '#', value: (a: any) => Number(a.jersey) || 0, render: (a: any) => a.jersey },
                { key: 'name', label: 'Name', left: true, value: (a: any) => a.lastName, render: (a: any) => <PlayerLink id={String(a.id)} name={a.fullName} /> },
                { key: 'pos', label: 'POS', value: (a: any) => a.position?.abbreviation, render: (a: any) => a.position?.abbreviation },
                { key: 'age', label: 'AGE', value: (a: any) => a.age, render: (a: any) => a.age },
                { key: 'ht', label: 'HT', render: (a: any) => a.displayHeight },
                { key: 'wt', label: 'WT', value: (a: any) => parseInt(a.displayWeight), render: (a: any) => a.displayWeight?.replace(' lbs', '') },
                { key: 'exp', label: 'EXP', value: (a: any) => a.experience?.years, render: (a: any) => (a.experience?.years ? a.experience.years : 'R') },
                { key: 'col', label: 'College', left: true, render: (a: any) => a.college?.shortName || a.college?.name || '' },
              ]}
            />
          </Section>
        ) : null,
      )}
    </div>
  );
}

function TeamSeasonStats({ teamId }: { teamId: string }) {
  const q = useEspn(urls.teamStats(teamId));
  if (q.error && !q.data) return <ErrorBox error={q.error} retry={q.reload} />;
  if (!q.data) return <Loading what="Loading team stats" />;
  const cats: any[] = q.data.results?.stats?.categories || [];
  return (
    <div>
      {cats.map((c) => (
        <Section key={c.name} title={c.displayName}>
          <StatTable
            dense
            rows={c.stats || []}
            rowKey={(s: any) => s.name}
            sortable={false}
            cols={[
              { key: 'label', label: 'Stat', left: true, render: (s: any) => <span title={s.description}>{s.displayName}</span> },
              { key: 'v', label: 'Value', highlight: true, render: (s: any) => s.displayValue },
              { key: 'rk', label: 'NFL rank', render: (s: any) => s.rankDisplayValue || '' },
            ]}
          />
        </Section>
      ))}
    </div>
  );
}
