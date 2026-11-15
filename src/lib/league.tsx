import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { urls } from './espn';
import TEAMS from './teams.json';
import { useEspn } from './hooks';

export type Team = {
  id: string;
  abbr: string; // "GB"
  slug: string; // "gb"
  name: string; // "Green Bay Packers"
  short: string; // "Packers"
  location: string;
  color: string;
  alt: string;
  logo?: string;
  conf?: 'afc' | 'nfc';
  div?: string; // "north"
};

export type Division = { conf: 'afc' | 'nfc'; key: string; name: string; teamIds: string[] };

type League = {
  ready: boolean;
  teams: Team[];
  byId: Record<string, Team>;
  byAbbr: Record<string, Team>;
  divisions: Division[];
  standings: any;
};

const Ctx = createContext<League | null>(null);

export const CONF_NAMES = { afc: 'AFC', nfc: 'NFC' } as const;
export const DIV_KEYS = ['east', 'north', 'south', 'west'] as const;
export const divName = (conf: string, div: string) => `${conf.toUpperCase()} ${div[0].toUpperCase()}${div.slice(1)}`;

export function LeagueProvider({ children }: { children: ReactNode }) {
  const standQ = useEspn(urls.standings(), 5 * 60_000);

  const value = useMemo<League>(() => {
    // Team names, colors and logos ship with the app (see scripts/gen-teams.mjs).
    const teams: Team[] = TEAMS.map((t) => ({ ...t, slug: t.abbr.toLowerCase() }));
    const byId: Record<string, Team> = {};
    teams.forEach((t) => (byId[t.id] = t));

    const divisions: Division[] = [];
    for (const conf of standQ.data?.children || []) {
      const c = String(conf.abbreviation || '').toLowerCase() as 'afc' | 'nfc';
      for (const d of conf.children || []) {
        const key = String(d.abbreviation || d.name.split(' ').pop()).toLowerCase();
        const ids = (d.standings?.entries || []).map((e: any) => String(e.team.id));
        divisions.push({ conf: c, key, name: d.name, teamIds: ids });
        ids.forEach((id: string) => {
          if (byId[id]) Object.assign(byId[id], { conf: c, div: key });
        });
      }
    }
    const byAbbr: Record<string, Team> = {};
    teams.forEach((t) => (byAbbr[t.abbr] = t));
    return { ready: teams.length > 0, teams, byId, byAbbr, divisions, standings: standQ.data };
  }, [standQ.data]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLeague() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLeague outside LeagueProvider');
  return v;
}

/** Find the standings entry list for a division, sorted by ESPN's order. */
export function divisionEntries(standings: any, conf: string, div: string): any[] {
  const c = standings?.children?.find((x: any) => String(x.abbreviation).toLowerCase() === conf);
  const d = c?.children?.find((x: any) => String(x.abbreviation).toLowerCase() === div);
  return d?.standings?.entries || [];
}

export function entryStat(entry: any, name: string): string {
  const s = entry?.stats?.find((x: any) => x.name === name || x.type === name);
  return s?.displayValue ?? s?.summary ?? '';
}
