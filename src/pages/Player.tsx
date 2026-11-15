import { Link, useParams } from 'react-router-dom';
import { Crumbs, ErrorBox, Loading, Section, StatTable, Tabs, TeamLink, TeamLogo, teamCrumbs, useTab } from '../components/ui';
import { urls } from '../lib/espn';
import { useEspn } from '../lib/hooks';
import { useLeague } from '../lib/league';

const TABS = ['gamelog', 'career'];
const LABELS = { gamelog: 'Game log', career: 'Career' };

export function Player() {
  const { id = '' } = useParams();
  const league = useLeague();
  const q = useEspn(urls.athlete(id));
  const [tab, setTab] = useTab(TABS);

  if (q.error && !q.data) return <ErrorBox error={q.error} retry={q.reload} />;
  if (!q.data) return <Loading what="Loading player" />;
  const a = q.data.athlete || {};
  const teamId = a.team?.id ? String(a.team.id) : undefined;
  const t = teamId ? league.byId[teamId] : undefined;
  const summary: any[] = a.statsSummary?.statistics || [];

  return (
    <div>
      <Crumbs items={[...teamCrumbs(teamId, league), { label: a.displayName }]} />
      <div className="player-header" style={{ borderColor: t?.color }}>
        {a.headshot?.href ? <img className="headshot" src={a.headshot.href} alt="" /> : <div className="headshot" />}
        <div>
          <h1>{a.displayName}</h1>
          <div className="ph-sub">
            {a.displayJersey} · {a.position?.displayName}
            {teamId && (
              <>
                {' · '}
                <TeamLink id={teamId} />
              </>
            )}
          </div>
          <div className="ph-bio small muted">
            {[a.displayHeight, a.displayWeight, a.age ? `Age ${a.age}` : '', a.displayExperience, a.college?.name].filter(Boolean).join(' · ')}
          </div>
          {a.displayDraft && <div className="small muted">Draft: {a.displayDraft}</div>}
          {a.status?.type && a.status.type !== 'active' && <div className="tag bad">{a.status.name}</div>}
          {a.injuries?.[0] && <div className="tag warn">{a.injuries[0].status}</div>}
        </div>
      </div>

      {summary.length > 0 && (
        <div className="summary-chips">
          <div className="small muted">{a.statsSummary.displayName}</div>
          <div className="chip-row">
            {summary.map((s) => (
              <div key={s.name} className="stat-chip">
                <b>{s.displayValue}</b>
                <span>{s.shortDisplayName || s.abbreviation}</span>
                {s.rankDisplayValue && <span className="rank">{s.rankDisplayValue}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <Tabs tabs={TABS} labels={LABELS} value={tab} onChange={setTab} />
      {tab === 'gamelog' && <GameLog id={id} />}
      {tab === 'career' && <Career id={id} />}
    </div>
  );
}

function GameLog({ id }: { id: string }) {
  const q = useEspn(urls.gamelog(id));
  if (q.error && !q.data) return <ErrorBox error={q.error} retry={q.reload} />;
  if (!q.data) return <Loading what="Loading game log" />;
  const gl = q.data;
  const labels: string[] = gl.labels || [];
  const evs: Record<string, any> = gl.events || {};
  const seasons: any[] = gl.seasonTypes || [];
  if (!seasons.length) return <p className="muted">No games this season.</p>;

  return (
    <div>
      {seasons.map((s) => {
        const rows = (s.categories || []).flatMap((c: any) => c.events || []).map((e: any) => ({ ...e, ev: evs[e.eventId] || {} }));
        if (!rows.length) return null;
        const totals = s.summary?.stats?.[0]?.stats;
        return (
          <Section key={s.displayName} title={s.displayName}>
            <StatTable
              dense
              rows={rows}
              rowKey={(r: any) => r.eventId}
              cols={[
                { key: 'wk', label: 'WK', value: (r: any) => r.ev.week, render: (r: any) => r.ev.week },
                {
                  key: 'opp',
                  label: 'OPP',
                  left: true,
                  value: (r: any) => r.ev.opponent?.abbreviation,
                  render: (r: any) => (
                    <span className="opp-cell">
                      {r.ev.atVs}{' '}
                      <Link to={`/nfl/team/${String(r.ev.opponent?.abbreviation).toLowerCase()}`}>
                        <TeamLogo id={String(r.ev.opponent?.id)} size={16} /> {r.ev.opponent?.abbreviation}
                      </Link>
                    </span>
                  ),
                },
                {
                  key: 'res',
                  label: 'RESULT',
                  left: true,
                  render: (r: any) => (
                    <Link to={`/nfl/game/${r.eventId}`} className={`res ${r.ev.gameResult}`}>
                      <b>{r.ev.gameResult}</b> {r.ev.score}
                    </Link>
                  ),
                },
                ...labels.map((l, i) => ({ key: `s${i}`, label: l, title: gl.displayNames?.[i], value: (r: any) => r.stats?.[i], render: (r: any) => r.stats?.[i] })),
              ]}
              totals={totals ? ['Totals', '', '', ...totals] : undefined}
            />
          </Section>
        );
      })}
    </div>
  );
}

function Career({ id }: { id: string }) {
  const q = useEspn(urls.athleteStats(id));
  const league = useLeague();
  if (q.error && !q.data) return <ErrorBox error={q.error} retry={q.reload} />;
  if (!q.data) return <Loading what="Loading career stats" />;
  const cats: any[] = q.data.categories || [];
  if (!cats.length) return <p className="muted">No career stats.</p>;
  return (
    <div>
      {cats.map((c) => (
        <Section key={c.name} title={c.displayName}>
          <StatTable
            dense
            rows={[...(c.statistics || [])].reverse()}
            rowKey={(r: any, i) => `${r.season?.year}-${r.teamId}-${i}`}
            cols={[
              { key: 'yr', label: 'Year', left: true, value: (r: any) => r.season?.year, render: (r: any) => r.season?.displayName },
              {
                key: 'tm',
                label: 'Team',
                left: true,
                value: (r: any) => league.byId[String(r.teamId)]?.abbr,
                render: (r: any) => (league.byId[String(r.teamId)] ? <TeamLink id={String(r.teamId)} label="abbr" size={16} /> : ''),
              },
              ...(c.labels || []).map((l: string, i: number) => ({ key: `s${i}`, label: l, title: c.displayNames?.[i], value: (r: any) => r.stats?.[i], render: (r: any) => r.stats?.[i] })),
            ]}
            totals={c.totals?.length ? ['Career', '', ...c.totals] : undefined}
          />
        </Section>
      ))}
    </div>
  );
}
