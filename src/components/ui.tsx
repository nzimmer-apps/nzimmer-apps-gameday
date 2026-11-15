import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLeague } from '../lib/league';

export type Crumb = { to?: string; label: string };

/** Breadcrumb trail. "NFL" is always first. */
export function Crumbs({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ to: '/nfl', label: 'NFL' }, ...items];
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {all.map((c, i) => (
        <span key={i}>
          {i > 0 && <span className="sep">›</span>}
          {c.to && i < all.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** Breadcrumbs for anything that belongs to a team: NFL › NFC › NFC North › Packers */
export function teamCrumbs(teamId: string | undefined, league: ReturnType<typeof useLeague>, linkTeam = true): Crumb[] {
  const t = teamId ? league.byId[teamId] : undefined;
  if (!t) return [];
  const out: Crumb[] = [];
  if (t.conf) out.push({ to: `/nfl/${t.conf}`, label: t.conf.toUpperCase() });
  if (t.conf && t.div) out.push({ to: `/nfl/${t.conf}/${t.div}`, label: `${t.conf.toUpperCase()} ${cap(t.div)}` });
  out.push({ to: linkTeam ? `/nfl/team/${t.slug}` : undefined, label: t.short });
  return out;
}

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function TeamLogo({ id, src, size = 24 }: { id?: string; src?: string; size?: number }) {
  const league = useLeague();
  const url = src || (id ? league.byId[id]?.logo : undefined);
  if (!url) return <span className="logo-ph" style={{ width: size, height: size }} />;
  return <img className="logo" src={url} width={size} height={size} alt="" loading="lazy" />;
}

/** Team name that links to the team page. Accepts an ESPN team id or abbreviation. */
export function TeamLink({
  id,
  abbr,
  label = 'short',
  logo = true,
  size = 22,
}: {
  id?: string;
  abbr?: string;
  label?: 'short' | 'name' | 'abbr';
  logo?: boolean;
  size?: number;
}) {
  const league = useLeague();
  const t = (id && league.byId[String(id)]) || (abbr && league.byAbbr[abbr.toUpperCase()]);
  if (!t) return <span>{abbr || id}</span>;
  const text = label === 'name' ? t.name : label === 'abbr' ? t.abbr : t.short;
  return (
    <Link className="team-link" to={`/nfl/team/${t.slug}`}>
      {logo && <TeamLogo src={t.logo} size={size} />}
      <span>{text}</span>
    </Link>
  );
}

export function PlayerLink({ id, name }: { id?: string; name: string }) {
  if (!id) return <span>{name}</span>;
  return (
    <Link className="player-link" to={`/nfl/player/${id}`}>
      {name}
    </Link>
  );
}

/** Tabs kept in the URL (?tab=...) so every tab is linkable. */
export function useTab(tabs: string[], fallback = tabs[0]): [string, (t: string) => void] {
  const [sp, setSp] = useSearchParams();
  const cur = sp.get('tab');
  const tab = cur && tabs.includes(cur) ? cur : fallback;
  return [
    tab,
    (t) => {
      const next = new URLSearchParams(sp);
      next.set('tab', t);
      setSp(next, { replace: true });
    },
  ];
}

export function Tabs({ tabs, labels, value, onChange }: { tabs: string[]; labels?: Record<string, string>; value: string; onChange: (t: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t} role="tab" aria-selected={t === value} className={t === value ? 'on' : ''} onClick={() => onChange(t)}>
          {labels?.[t] || cap(t)}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.v} className={o.v === value ? 'chip on' : 'chip'} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type Col<R> = {
  key: string;
  label: string;
  title?: string;
  render?: (r: R) => ReactNode;
  value?: (r: R) => string | number | undefined;
  left?: boolean;
  highlight?: boolean;
};

function sortValue(v: unknown): number | string {
  if (v == null || v === '' || v === '-' || v === '--') return -Infinity;
  if (typeof v === 'number') return v;
  const s = String(v);
  const n = Number(s.replace(/,/g, '').replace(/^\+/, ''));
  if (!Number.isNaN(n)) return n;
  const rec = s.match(/^(\d+)-(\d+)/); // "6-3" or "4-8"
  if (rec) return Number(rec[1]) - Number(rec[2]) / 100;
  return s.toLowerCase();
}

/** Table with a sticky first column and tap-to-sort headers. */
export function StatTable<R>({
  cols,
  rows,
  rowKey,
  hl,
  totals,
  sortable = true,
  dense,
}: {
  cols: Col<R>[];
  rows: R[];
  rowKey: (r: R, i: number) => string;
  hl?: (r: R) => boolean;
  totals?: ReactNode[];
  sortable?: boolean;
  dense?: boolean;
}) {
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find((c) => c.key === sort.k);
    if (!col) return rows;
    const get = col.value || ((r: R) => (r as any)[col.key]);
    return [...rows].sort((a, b) => {
      const va = sortValue(get(a));
      const vb = sortValue(get(b));
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
    });
  }, [rows, cols, sort]);

  return (
    <div className="table-wrap">
      <table className={dense ? 'stats dense' : 'stats'}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                title={c.title}
                className={`${c.left ? 'l' : ''} ${sort?.k === c.key ? 'sorted' : ''}`}
                onClick={
                  sortable
                    ? () => setSort((s) => (s?.k === c.key ? (s.dir === -1 ? { k: c.key, dir: 1 } : null) : { k: c.key, dir: c.left ? 1 : -1 }))
                    : undefined
                }
              >
                {c.label}
                {sort?.k === c.key ? (sort.dir === -1 ? ' ▾' : ' ▴') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={rowKey(r, i)} className={hl?.(r) ? 'hl' : ''}>
              {cols.map((c) => (
                <td key={c.key} className={`${c.left ? 'l' : ''} ${c.highlight ? 'em' : ''}`}>
                  {c.render ? c.render(r) : String((r as any)[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              {totals.map((t, i) => (
                <td key={i} className={i === 0 ? 'l' : ''}>
                  {t}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <div className="loading">{what}…</div>;
}

export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="error">
      Couldn't load from ESPN ({error}).{' '}
      {retry && (
        <button className="linkish" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Section({ title, right, children }: { title: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
