import { Crumbs, ErrorBox, Loading, PlayerLink, TeamLink } from '../components/ui';
import { urls } from '../lib/espn';
import { useEspn, useSettings } from '../lib/hooks';
import { LeaderTabs } from './Awards';

export function Leaders() {
  const q = useEspn(urls.leaders(), 10 * 60_000);
  const { favorites } = useSettings();
  if (q.error && !q.data) return <ErrorBox error={q.error} retry={q.reload} />;
  if (!q.data) return <Loading what="Loading leaders" />;
  const cats: any[] = q.data.leaders?.categories || [];
  return (
    <div>
      <Crumbs items={[{ label: 'Stat leaders' }]} />
      <h1 className="page-title">Stat leaders</h1>
      <LeaderTabs on="leaders" />
      <p className="small muted">For fumbles, forced fumbles and recoveries, open a player's Career tab or a game's Turnovers list.</p>
      <div className="leaders-grid">
        {cats.map((c) => (
          <div key={c.name} className="card">
            <h3>{c.displayName}</h3>
            <ol className="leader-list">
              {(c.leaders || []).map((l: any, i: number) => {
                const abbr = l.team?.abbreviation;
                return (
                  <li key={i} className={favorites.includes(abbr) ? 'hl' : ''}>
                    <span className="rk">{i + 1}</span>
                    <span className="nm">
                      <PlayerLink id={l.athlete?.id} name={l.athlete?.displayName} />
                      <span className="small muted"> {l.athlete?.position?.abbreviation}</span>
                    </span>
                    <span className="tm">{l.team?.id && <TeamLink id={String(l.team.id)} label="abbr" size={16} />}</span>
                    <b className="val">{l.displayValue}</b>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
