import { describe, expect, it } from 'vitest';
import { addPlay, buildBoxes, emptyBox, findLine, inSplit, shortName, type PlayIn } from './splits';

// Play texts copied from ESPN's feed.
const base = { offense: 'GB', defense: 'CAR', startDown: 1, startDistance: 10, startToGo: 75 };
const run = (p: Partial<PlayIn> & { text: string }) => {
  const boxes = { GB: emptyBox(), CAR: emptyBox() };
  addPlay(boxes, { period: 1, ...base, ...p });
  return boxes;
};

describe('addPlay', () => {
  it('reads a completion', () => {
    const b = run({ text: '(Shotgun) J.Love pass short left to M.Golden ran ob at CAR 21 for 8 yards (P.Jones).' });
    expect(b.GB.passing.get('J.Love')).toMatchObject({ comp: 1, att: 1, yds: 8 });
    expect(b.GB.receiving.get('M.Golden')).toMatchObject({ rec: 1, yds: 8, tgts: 1 });
    expect(b.CAR.defense.get('P.Jones')).toMatchObject({ tot: 1, solo: 1 });
  });

  it('credits yards only to the spot of an offensive foul', () => {
    const b = run({
      startToGo: 29,
      text: '(Shotgun) J.Love pass short left to M.Golden ran ob at CAR 21 for 8 yards (P.Jones).PENALTY on GB-S.Williams, Offensive Holding, 10 yards, enforced at CAR 25.',
    });
    expect(b.GB.passing.get('J.Love')?.yds).toBe(4);
    expect(b.GB.totals.penalties).toBe(1);
    expect(b.GB.totals.penYds).toBe(10);
  });

  it('counts a rushing touchdown even though the text mentions the extra point', () => {
    const b = run({ text: '(Shotgun) J.Jacobs right tackle for 1 yard, TOUCHDOWN. T.Smack extra point is GOOD, Center-M.Orzech, Holder-D.Whelan.' });
    expect(b.GB.rushing.get('J.Jacobs')).toMatchObject({ car: 1, yds: 1, td: 1 });
    expect(b.GB.kicking.get('T.Smack')).toMatchObject({ xpm: 1, xpa: 1, pts: 1 });
    expect(b.GB.totals.points).toBe(7);
  });

  it('ignores the two-point try after a touchdown', () => {
    const b = run({
      text: '(Shotgun) J.Love pass short left to D.Moore for 11 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. J.Love pass to J.Hawes is incomplete. ATTEMPT FAILS.',
    });
    expect(b.GB.passing.get('J.Love')).toMatchObject({ comp: 1, att: 1, yds: 11, td: 1 });
    expect(b.GB.receiving.get('J.Hawes')).toBeUndefined();
  });

  it('reads a sack with a shared sack', () => {
    const b = run({ text: '(Shotgun) J.Love sacked at GB 30 for -8 yards (B.Burns; D.Brown).' });
    expect(b.GB.passing.get('J.Love')).toMatchObject({ sacks: 1, sackYds: 8 });
    expect(b.GB.totals.passYds).toBe(-8);
    expect(b.CAR.defense.get('B.Burns')?.sacks).toBe(0.5);
  });

  it('gives yards after a lateral to the player who caught it', () => {
    const b = run({
      text: '(Shotgun) J.Love pass short middle to T.Kraft to CAR 24 for 8 yards. Lateral to J.Reed to CAR 26 for 2 yards (J.Bullard).',
    });
    expect(b.GB.passing.get('J.Love')?.yds).toBe(10);
    expect(b.GB.receiving.get('T.Kraft')?.yds).toBe(8);
    expect(b.GB.receiving.get('J.Reed')?.yds).toBe(2);
  });

  it('credits a return only to the spot of a foul by the return team', () => {
    const boxes = { JAX: emptyBox(), IND: emptyBox() };
    addPlay(boxes, {
      period: 1,
      offense: 'JAX',
      defense: 'IND',
      text: 'C.Little kicks 63 yards from JAX 35 to IND 2. S.McGowan ran ob at IND 40 for 38 yards (Q.Morris).PENALTY on IND-A.Ajiake, Offensive Holding, 10 yards, enforced at IND 30.',
    });
    expect(boxes.IND.kickReturns.get('S.McGowan')).toMatchObject({ no: 1, yds: 28 });
  });

  it('reads the summary form some plays use', () => {
    const b = run({ text: 'Jalen Coker 26 Yd pass from Bryce Young (Two-Point Pass Conversion Failed)' });
    expect(b.GB.passing.get('B.Young')).toMatchObject({ comp: 1, yds: 26, td: 1 });
  });

  it('skips plays wiped out by a penalty but still counts the flag', () => {
    const b = run({ text: 'PENALTY on GB-J.Jenkins, False Start, 5 yards, enforced at GB 25 - No Play.' });
    expect(b.GB.totals.plays).toBe(0);
    expect(b.GB.totals.penalties).toBe(1);
  });

  it('counts a 3rd-down conversion from ESPN play yardage', () => {
    const b = run({ startDown: 3, startDistance: 4, statYardage: 6, text: 'J.Jacobs up the middle to CAR 30 for 6 yards (D.Brown).' });
    expect(b.GB.totals).toMatchObject({ thirdAtt: 1, thirdConv: 1, firstDowns: 1 });
  });
});

describe('splits', () => {
  it('filters by quarter and half', () => {
    expect([1, 2, 3, 4, 5].filter((q) => inSplit(q, 'h1'))).toEqual([1, 2]);
    expect([1, 2, 3, 4, 5].filter((q) => inSplit(q, 'ot'))).toEqual([5]);
    const plays: PlayIn[] = [
      { ...base, period: 1, text: 'J.Jacobs up the middle to CAR 30 for 6 yards (D.Brown).' },
      { ...base, period: 3, text: 'J.Jacobs left end to CAR 20 for 10 yards (D.Brown).' },
    ];
    expect(buildBoxes(plays, ['GB', 'CAR'], 'q1').GB.rushing.get('J.Jacobs')?.yds).toBe(6);
    expect(buildBoxes(plays, ['GB', 'CAR'], 'all').GB.rushing.get('J.Jacobs')?.yds).toBe(16);
  });

  it('matches box-score names to play-text names', () => {
    expect(shortName('Michael Penix Jr.')).toBe('M.Penix');
    const m = new Map([['M.Penix', 1]]);
    expect(findLine(m, { firstName: 'Michael', lastName: 'Penix Jr.', displayName: 'Michael Penix Jr.' })).toBe(1);
  });
});
