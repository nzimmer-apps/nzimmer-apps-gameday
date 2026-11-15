import { Fragment, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chips, PlayerLink, Section, StatTable, TeamLink, type Col } from '../components/ui';
import { SPLITS, buildBoxes, inSplit, type PlayIn, type Split, type TeamBox } from '../lib/splits';

export type SplitTeam = { id: string; abbr: string; name: string; home: boolean };

/** Quarter / half picker kept in the URL (?split=q2) so it's linkable and shared by Box score and Team stats. */
export function useSplit(maxPeriod: number): [Split, (s: Split) => void, { v: Split; label: string }[]] {
  const [sp, setSp] = useSearchParams();
  const options = SPLITS.filter((o) => {
    if (o.v === 'all') return true;
    if (o.v === 'ot') return maxPeriod >= 5;
    if (o.v === 'h1') return maxPeriod >= 2;
    if (o.v === 'h2') return maxPeriod >= 4;
    return Number(o.v.slice(1)) <= maxPeriod;
  });
  const cur = sp.get('split') as Split | null;
  const split = cur && options.some((o) => o.v === cur) ? cur : 'all';
  return [
    split,
    (s) => {
      const next = new URLSearchParams(sp);
      if (s === 'all') next.delete('split');
      else next.set('split', s);
      setSp(next, { replace: true });
    },
    options,
  ];
}

export function SplitPicker({ split, setSplit, options }: { split: Split; setSplit: (s: Split) => void; options: { v: Split; label: string }[] }) {
  if (options.length <= 1) return null;
  return (
    <div className="split-picker">
      <Chips options={options} value={split} onChange={setSplit} />
    </div>
  );
}

export function SplitNote() {
  return (
    <p className="small muted split-note">
      Quarter stats are rebuilt from the play-by-play. They usually match ESPN exactly, but plays with penalties or laterals can be off by a yard or two.
      Tackles are approximate. Pick "Game" for the official box score.
    </p>
  );
}

type Names = { nameToId: Map<string, string>; idName: Map<string, string> };

function who(n: string, names: Names) {
  const id = names.nameToId.get(n);
  const full = id ? names.idName.get(id) : undefined;
  return { id, label: full || n };
}

const avg = (yds: number, n: number) => (n ? (yds / n).toFixed(1) : '0.0');
const sacksFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function useBoxes(plays: PlayIn[], teams: SplitTeam[], split: Split) {
  return useMemo(
    () =>
      buildBoxes(
        plays,
        teams.map((t) => t.abbr),
        split,
      ),
    [plays, teams, split],
  );
}

/** Box score for one quarter or half. */
export function SplitBox({ plays, teams, split, names }: { plays: PlayIn[]; teams: SplitTeam[]; split: Split; names: Names }) {
  const boxes = useBoxes(plays, teams, split);
  const ordered = [...teams].sort((a) => (a.home ? 1 : -1));
  const [side, setSide] = useState(ordered[0]?.abbr);
  const box: TeamBox | undefined = boxes[side];
  if (!box) return null;

  const fum = (n: string) => box.fumbles.get(n) || { fum: 0, lost: 0, rec: 0 };
  const nameCol = <T,>(): Col<[string, T]> => ({
    key: 'name',
    label: 'Player',
    left: true,
    value: ([n]) => who(n, names).label,
    render: ([n]) => {
      const w = who(n, names);
      return <PlayerLink id={w.id} name={w.label} />;
    },
  });
  const num = <T,>(key: string, label: string, get: (v: T, n: string) => number | string, title?: string): Col<[string, T]> => ({
    key,
    label,
    title,
    value: ([n, v]) => {
      const x = get(v, n);
      return typeof x === 'number' ? x : x;
    },
    render: ([n, v]) => String(get(v, n)),
  });
  const rows = <T,>(m: Map<string, T>, by: (v: T) => number) => [...m.entries()].sort((a, b) => by(b[1]) - by(a[1]));

  const tables: { key: string; title: string; el: JSX.Element | null }[] = [
    {
      key: 'passing',
      title: 'Passing',
      el: box.passing.size ? (
        <StatTable
          dense
          rows={rows(box.passing, (v) => v.att)}
          rowKey={([n]) => n}
          cols={[
            nameCol(),
            num('ca', 'C/ATT', (v: any) => `${v.comp}/${v.att}`),
            num('yds', 'YDS', (v: any) => v.yds),
            num('avg', 'AVG', (v: any) => avg(v.yds, v.att)),
            num('td', 'TD', (v: any) => v.td),
            num('int', 'INT', (v: any) => v.int),
            num('fum', 'FUM', (_v: any, n) => fum(n).fum),
            num('lost', 'LOST', (_v: any, n) => fum(n).lost),
            num('sk', 'SACKS', (v: any) => `${v.sacks}-${v.sackYds}`),
          ]}
        />
      ) : null,
    },
    {
      key: 'rushing',
      title: 'Rushing',
      el: box.rushing.size ? (
        <StatTable
          dense
          rows={rows(box.rushing, (v) => v.car)}
          rowKey={([n]) => n}
          cols={[
            nameCol(),
            num('car', 'CAR', (v: any) => v.car),
            num('yds', 'YDS', (v: any) => v.yds),
            num('avg', 'AVG', (v: any) => avg(v.yds, v.car)),
            num('td', 'TD', (v: any) => v.td),
            num('fum', 'FUM', (_v: any, n) => fum(n).fum),
            num('lost', 'LOST', (_v: any, n) => fum(n).lost),
            num('lng', 'LONG', (v: any) => v.long),
          ]}
        />
      ) : null,
    },
    {
      key: 'receiving',
      title: 'Receiving',
      el: box.receiving.size ? (
        <StatTable
          dense
          rows={rows(box.receiving, (v) => v.rec * 1000 + v.yds)}
          rowKey={([n]) => n}
          cols={[
            nameCol(),
            num('rec', 'REC', (v: any) => v.rec),
            num('yds', 'YDS', (v: any) => v.yds),
            num('avg', 'AVG', (v: any) => avg(v.yds, v.rec)),
            num('td', 'TD', (v: any) => v.td),
            num('fum', 'FUM', (_v: any, n) => fum(n).fum),
            num('lost', 'LOST', (_v: any, n) => fum(n).lost),
            num('lng', 'LONG', (v: any) => v.long),
            num('tgt', 'TGTS', (v: any) => v.tgts),
          ]}
        />
      ) : null,
    },
    {
      key: 'defense',
      title: 'Defense',
      el: box.defense.size ? (
        <StatTable
          dense
          rows={rows(box.defense, (v) => v.tot * 100 + v.sacks * 10 + v.int)}
          rowKey={([n]) => n}
          cols={[
            nameCol(),
            num('tot', 'TOT', (v: any) => v.tot),
            num('solo', 'SOLO', (v: any) => v.solo),
            num('sk', 'SACKS', (v: any) => sacksFmt(v.sacks)),
            num('tfl', 'TFL', (v: any) => sacksFmt(v.tfl)),
            num('int', 'INT', (v: any) => v.int),
            num('ff', 'FF', (v: any) => v.ff, 'Forced fumbles'),
            num('fr', 'FR', (v: any) => v.fr, 'Fumbles recovered'),
            num('td', 'TD', (v: any) => v.td),
          ]}
        />
      ) : null,
    },
    ...(['kickReturns', 'puntReturns'] as const).map((k) => ({
      key: k,
      title: k === 'kickReturns' ? 'Kick returns' : 'Punt returns',
      el: box[k].size ? (
        <StatTable
          dense
          rows={rows(box[k], (v) => v.no)}
          rowKey={([n]) => n}
          cols={[
            nameCol(),
            num('no', 'NO', (v: any) => v.no),
            num('yds', 'YDS', (v: any) => v.yds),
            num('avg', 'AVG', (v: any) => avg(v.yds, v.no)),
            num('lng', 'LONG', (v: any) => v.long),
            num('fum', 'FUM', (_v: any, n) => fum(n).fum),
            num('td', 'TD', (v: any) => v.td),
          ]}
        />
      ) : null,
    })),
    {
      key: 'kicking',
      title: 'Kicking',
      el: box.kicking.size ? (
        <StatTable
          dense
          rows={rows(box.kicking, (v) => v.pts)}
          rowKey={([n]) => n}
          cols={[
            nameCol(),
            num('fg', 'FG', (v: any) => `${v.fgm}/${v.fga}`),
            num('lng', 'LONG', (v: any) => v.long),
            num('xp', 'XP', (v: any) => `${v.xpm}/${v.xpa}`),
            num('pts', 'PTS', (v: any) => v.pts),
          ]}
        />
      ) : null,
    },
    {
      key: 'punting',
      title: 'Punting',
      el: box.punting.size ? (
        <StatTable
          dense
          rows={rows(box.punting, (v) => v.no)}
          rowKey={([n]) => n}
          cols={[
            nameCol(),
            num('no', 'NO', (v: any) => v.no),
            num('yds', 'YDS', (v: any) => v.yds),
            num('avg', 'AVG', (v: any) => avg(v.yds, v.no)),
            num('lng', 'LONG', (v: any) => v.long),
          ]}
        />
      ) : null,
    },
  ];

  const shown = tables.filter((t) => t.el);
  return (
    <div>
      <Chips options={ordered.map((t) => ({ v: t.abbr, label: t.name }))} value={side} onChange={setSide} />
      {!shown.length && <p className="muted">No plays for this team in this part of the game.</p>}
      {shown.map((t) => (
        <Section key={t.key} title={t.title}>
          {t.el}
        </Section>
      ))}
      <SplitNote />
    </div>
  );
}

/** Team-vs-team stats for one quarter or half. */
export function SplitTeamStats({
  plays,
  teams,
  split,
  linescores,
}: {
  plays: PlayIn[];
  teams: SplitTeam[];
  split: Split;
  /** points per period by team abbreviation, from the official line score */
  linescores: Record<string, number[]>;
}) {
  const boxes = useBoxes(plays, teams, split);
  const away = teams.find((t) => !t.home)!;
  const home = teams.find((t) => t.home)!;
  const A = boxes[away.abbr]?.totals;
  const H = boxes[home.abbr]?.totals;
  if (!A || !H) return null;

  const pts = (abbr: string) => (linescores[abbr] || []).reduce((s, v, i) => (inSplit(i + 1, split) ? s + v : s), 0);
  const ypp = (t: typeof A) => (t.plays ? (t.yards / t.plays).toFixed(1) : '0.0');
  const ypr = (t: typeof A) => (t.rushAtt ? (t.rushYds / t.rushAtt).toFixed(1) : '0.0');
  const rows: [string, string, (t: typeof A, abbr: string) => string | number, boolean?][] = [
    ['Scoring', 'Points', (_t, ab) => pts(ab)],
    ['Offense', 'Total yards', (t) => t.yards],
    ['Offense', 'Plays', (t) => t.plays],
    ['Offense', 'Yards per play', (t) => ypp(t)],
    ['Offense', '1st downs (excl. penalties)', (t) => t.firstDowns],
    ['Passing', 'Net passing yards', (t) => t.passYds],
    ['Passing', 'Comp/Att', (t) => `${t.comp}/${t.att}`],
    ['Passing', 'Sacks-Yards lost', (t) => `${t.sacks}-${t.sackYds}`, true],
    ['Rushing', 'Rushing yards', (t) => t.rushYds],
    ['Rushing', 'Rushing attempts', (t) => t.rushAtt],
    ['Rushing', 'Yards per rush', (t) => ypr(t)],
    ['Situational', '3rd down', (t) => `${t.thirdConv}-${t.thirdAtt}`],
    ['Situational', '4th down', (t) => `${t.fourthConv}-${t.fourthAtt}`],
    ['Turnovers', 'Turnovers', (t) => t.int + t.fumLost, true],
    ['Turnovers', 'Fumbles (total)', (t) => t.fum, true],
    ['Turnovers', 'Fumbles lost', (t) => t.fumLost, true],
    ['Turnovers', 'Interceptions thrown', (t) => t.int, true],
    ['Penalties', 'Penalties-Yards', (t) => `${t.penalties}-${t.penYds}`, true],
  ];

  const better = (a: string | number, h: string | number, lowerIsBetter?: boolean): 'a' | 'h' | null => {
    const n = (v: string | number) => Number(String(v).split(/[-/]/)[0]);
    const x = n(a);
    const y = n(h);
    if (Number.isNaN(x) || Number.isNaN(y) || x === y) return null;
    return x > y !== !!lowerIsBetter ? 'a' : 'h';
  };

  let lastGroup = '';
  return (
    <div>
      <div className="table-wrap">
        <table className="versus">
          <thead>
            <tr>
              <th>
                <TeamLink id={away.id} label="abbr" />
              </th>
              <th />
              <th>
                <TeamLink id={home.id} label="abbr" />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([group, label, get, low]) => {
              const a = get(A, away.abbr);
              const h = get(H, home.abbr);
              const b = better(a, h, low);
              const head = group !== lastGroup;
              lastGroup = group;
              return (
                <Fragment key={label}>
                  {head && (
                    <tr className="group">
                      <td colSpan={3}>{group}</td>
                    </tr>
                  )}
                  <tr>
                    <td className={b === 'a' ? 'em' : ''}>{a}</td>
                    <td className="mid">{label}</td>
                    <td className={b === 'h' ? 'em' : ''}>{h}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <SplitNote />
    </div>
  );
}
