import { Link } from 'react-router-dom';
import { statusState } from '../lib/espn';
import { useSettings } from '../lib/hooks';
import { useLeague } from '../lib/league';
import { TeamLogo, fmtTime } from './ui';

/** One game on a scoreboard. The whole card opens the game; team names are not separate links here
 *  so the card stays one big tap target. */
export function GameCard({ event }: { event: any }) {
  const league = useLeague();
  const { favorites } = useSettings();
  const comp = event.competitions?.[0] || {};
  const state = statusState(comp.status || event.status);
  const sit = comp.situation;
  const teams = [...(comp.competitors || [])].sort((a: any) => (a.homeAway === 'away' ? -1 : 1));
  const fav = teams.some((c: any) => favorites.includes(c.team?.abbreviation));

  return (
    <Link to={`/nfl/game/${event.id}`} className={`game-card ${state} ${fav ? 'fav' : ''}`}>
      <div className="gc-teams">
        {teams.map((c: any) => {
          const t = league.byId[String(c.team?.id)];
          const poss = state === 'in' && sit?.possession === String(c.team?.id);
          const lost = state === 'post' && c.winner === false && teams.some((o: any) => o.winner);
          return (
            <div key={c.id} className={`gc-row ${lost ? 'lost' : ''}`}>
              <TeamLogo src={c.team?.logo || t?.logo} size={26} />
              <span className="gc-name">
                {c.team?.shortDisplayName || t?.short}
                <span className="gc-rec">{c.records?.[0]?.summary}</span>
              </span>
              {poss && <span className="poss" title="Has the ball">●</span>}
              {state !== 'pre' && <span className="gc-score">{c.score}</span>}
            </div>
          );
        })}
      </div>
      <div className="gc-status">
        {state === 'pre' && (
          <>
            <b>{fmtTime(event.date)}</b>
            <span>{comp.broadcast || comp.broadcasts?.[0]?.names?.[0] || ''}</span>
          </>
        )}
        {state === 'in' && (
          <>
            <b className="live">{comp.status?.type?.shortDetail}</b>
            {sit?.shortDownDistanceText && (
              <span className={sit.isRedZone ? 'rz' : ''}>
                {sit.shortDownDistanceText} · {sit.possessionText}
              </span>
            )}
          </>
        )}
        {state === 'post' && <b>{comp.status?.type?.shortDetail || 'Final'}</b>}
      </div>
    </Link>
  );
}
