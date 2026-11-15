import { describe, expect, it } from 'vitest';
import { defenseScore, impliedProb, offenseScore, rank, readByAthlete, rookieInfo, statLine, type Athlete } from './awards';

const ath = (id: string, pos: string, stats: Record<string, number>): Athlete => ({ id, name: id, short: id, pos, stats });

describe('scores', () => {
  it('scores offense fantasy-style', () => {
    // 2,618 pass yds (104.72) + 19 TD (76) - 6 INT (12) + 23 rush yds (2.3) + 2 rush TD (12)
    const qb = ath('love', 'QB', { 'passing.passingYards': 2618, 'passing.passingTouchdowns': 19, 'passing.interceptions': 6, 'rushing.rushingYards': 23, 'rushing.rushingTouchdowns': 2 });
    expect(offenseScore(qb)).toBeCloseTo(183.02, 2);
  });

  it('scores defense', () => {
    // From ESPN: Will Anderson Jr. — 35 tkl, 9.5 sacks, 13.5 TFL, 1 FF, 1 FR
    const de = ath('anderson', 'DE', { 'defensive.totalTackles': 35, 'defensive.sacks': 9.5, 'defensive.tacklesForLoss': 13.5, 'general.fumblesForced': 1, 'general.fumblesRecovered': 1 });
    expect(defenseScore(de)).toBeCloseTo(38 + 13.5 + 4 + 2 + 7, 5);
  });

  it('ranks with a filter and drops zero scores', () => {
    const list = [ath('a', 'RB', { 'rushing.rushingYards': 500 }), ath('b', 'QB', { 'passing.passingYards': 3000 }), ath('c', 'WR', {})];
    expect(rank(list, offenseScore, (a) => a.pos !== 'QB').map((r) => r.a.id)).toEqual(['a']);
  });

  it('turns American odds into a probability', () => {
    expect(impliedProb('+250')).toBeCloseTo(0.2857, 3);
    expect(impliedProb('-150')).toBeCloseTo(0.6, 3);
    expect(impliedProb('EVEN')).toBeUndefined();
  });
});

describe('readByAthlete', () => {
  it('flattens ESPN categories into named stats', () => {
    const d = {
      categories: [{ name: 'defensive', names: ['totalTackles', 'sacks'] }],
      athletes: [{ athlete: { id: 1, displayName: 'A B', position: { abbreviation: 'LB' }, teamId: '9' }, categories: [{ name: 'defensive', totals: ['1,035', '-'] }] }],
    };
    const [a] = readByAthlete(d);
    expect(a).toMatchObject({ id: '1', pos: 'LB', teamId: '9' });
    expect(a.stats['defensive.totalTackles']).toBe(1035);
    expect(a.stats['defensive.sacks']).toBeUndefined();
    expect(statLine(a)).toBe('1035 tkl');
  });
});

describe('rookies', () => {
  it('knows the first pick of the draft', () => {
    expect(rookieInfo('4837248')).toMatchObject({ round: 1, pick: 1 });
  });
});
