// ESPN's public (unofficial) JSON API. Personal use only; shapes are undocumented and can change,
// so every reader below treats fields as optional.

export const SPORT = 'football';
export const LEAGUE = 'nfl';

const SITE = `https://site.api.espn.com/apis/site/v2/sports/${SPORT}/${LEAGUE}`;
const SITE_V2 = `https://site.api.espn.com/apis/v2/sports/${SPORT}/${LEAGUE}`;
const WEB = `https://site.web.api.espn.com/apis`;

export const urls = {
  scoreboard: (q?: { year: number; type: number; week: number }) =>
    q ? `${SITE}/scoreboard?dates=${q.year}&seasontype=${q.type}&week=${q.week}` : `${SITE}/scoreboard`,
  summary: (id: string) => `${SITE}/summary?event=${id}`,
  team: (id: string) => `${SITE}/teams/${id}`,
  schedule: (id: string) => `${SITE}/teams/${id}/schedule`,
  roster: (id: string) => `${SITE}/teams/${id}/roster`,
  teamStats: (id: string) => `${SITE}/teams/${id}/statistics`,
  standings: () => `${SITE_V2}/standings?level=3`,
  leaders: () => `${WEB}/site/v3/sports/${SPORT}/${LEAGUE}/leaders`,
  athlete: (id: string) => `${WEB}/common/v3/sports/${SPORT}/${LEAGUE}/athletes/${id}`,
  athleteStats: (id: string) => `${WEB}/common/v3/sports/${SPORT}/${LEAGUE}/athletes/${id}/stats`,
  gamelog: (id: string) => `${WEB}/common/v3/sports/${SPORT}/${LEAGUE}/athletes/${id}/gamelog`,
};

// Short-lived in-memory cache so moving between screens is instant.
const memo = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export async function getJson<T = any>(url: string, maxAgeMs = 15_000): Promise<T> {
  const hit = memo.get(url);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.data as T;
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`ESPN returned ${r.status}`);
      return r.json();
    })
    .then((data) => {
      memo.set(url, { at: Date.now(), data });
      return data;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p as Promise<T>;
}

export function peekJson<T = any>(url: string): T | undefined {
  return memo.get(url)?.data as T | undefined;
}

// ---- Small helpers shared by screens ----

export type Logo = { href: string; rel?: string[] };

export function teamLogo(team: any, dark = false): string | undefined {
  if (!team) return undefined;
  if (team.logo && !dark) return team.logo;
  const logos: Logo[] = team.logos || [];
  const want = dark ? 'dark' : 'default';
  return (logos.find((l) => l.rel?.includes(want)) || logos[0])?.href || team.logo;
}

export const abbrSlug = (abbr?: string) => (abbr || '').toLowerCase();

export function statusState(status: any): 'pre' | 'in' | 'post' {
  return status?.type?.state || 'pre';
}

export function seasonTypeName(type: number) {
  return type === 1 ? 'Preseason' : type === 3 ? 'Postseason' : 'Regular Season';
}

/** Read a stat from a box score "statistics" array by name. */
export function stat(stats: any[] | undefined, name: string): string | undefined {
  return stats?.find((s) => s.name === name)?.displayValue;
}
