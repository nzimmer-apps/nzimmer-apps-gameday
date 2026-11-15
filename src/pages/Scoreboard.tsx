import { Link, useParams } from 'react-router-dom';
import { GameCard } from '../components/GameCard';
import { ErrorBox, Loading, Section, TeamLink } from '../components/ui';
import { seasonTypeName, statusState, urls } from '../lib/espn';
import { useEspn, useSettings } from '../lib/hooks';

type WeekRef = { year: number; type: number; week: number; label: string };

/** Flatten ESPN's calendar into an ordered list of weeks so we can link prev/next. */
function weekList(sb: any): WeekRef[] {
  const year = sb?.season?.year;
  const cal: any[] = sb?.leagues?.[0]?.calendar || [];
  const out: WeekRef[] = [];
  for (const block of cal) {
    const type = Number(block.value);
    if (type === 4) continue; // off season
    for (const e of block.entries || []) out.push({ year, type, week: Number(e.value), label: e.label });
  }
  return out;
}

const weekPath = (w: { year: number; type: number; week: number }) => `/nfl/week/${w.year}/${w.type}/${w.week}`;

export function Scoreboard() {
  const p = useParams();
  const q = p.year ? { year: Number(p.year), type: Number(p.type), week: Number(p.week) } : undefined;
  // Poll fast while anything is live, slower otherwise.
  const first = useEspn(urls.scoreboard(q), 60_000);
  const anyLive = (first.data?.events || []).some((e: any) => statusState(e.status) === 'in');
  const live = useEspn(anyLive ? urls.scoreboard(q) : null, 15_000);
  const data = (anyLive && live.data) || first.data;
  const { favorites } = useSettings();

  if (first.error && !data) return <ErrorBox error={first.error} retry={first.reload} />;
  if (!data) return <Loading what="Loading scores" />;

  const events: any[] = data.events || [];
  const weeks = weekList(data);
  const cur = { year: data.season?.year, type: data.season?.type, week: data.week?.number };
  const idx = weeks.findIndex((w) => w.type === cur.type && w.week === cur.week);
  const label = weeks[idx]?.label || `Week ${cur.week}`;

  const isFav = (e: any) => e.competitions?.[0]?.competitors?.some((c: any) => favorites.includes(c.team?.abbreviation));
  const favGames = events.filter(isFav);
  const others = events.filter((e) => !isFav(e));
  const by = (s: string) => others.filter((e) => statusState(e.status) === s);
  const groups: [string, any[]][] = [
    ['Live', by('in')],
    ['Upcoming', by('pre')],
    ['Final', by('post')],
  ];
  const bye: any[] = data.week?.teamsOnBye || [];

  return (
    <div>
      <div className="week-nav">
        {idx > 0 ? <Link to={weekPath(weeks[idx - 1])}>‹ {weeks[idx - 1].label}</Link> : <span />}
        <div className="week-title">
          <b>{label}</b>
          <span>
            {seasonTypeName(cur.type)} {cur.year}
          </span>
        </div>
        {idx >= 0 && idx < weeks.length - 1 ? <Link to={weekPath(weeks[idx + 1])}>{weeks[idx + 1].label} ›</Link> : <span />}
      </div>
      {q && (
        <p className="center small">
          <Link to="/">Back to this week</Link>
        </p>
      )}

      {favGames.length > 0 && (
        <Section title="Your teams">
          <div className="games">
            {favGames.map((e) => (
              <GameCard key={e.id} event={e} />
            ))}
          </div>
        </Section>
      )}

      {groups.map(([title, list]) =>
        list.length ? (
          <Section key={title} title={title}>
            <div className="games">
              {list.map((e) => (
                <GameCard key={e.id} event={e} />
              ))}
            </div>
          </Section>
        ) : null,
      )}

      {!events.length && <p className="muted center">No games this week.</p>}

      {bye.length > 0 && (
        <Section title="Bye">
          <div className="bye">
            {bye.map((t) => (
              <TeamLink key={t.id} id={String(t.id)} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
