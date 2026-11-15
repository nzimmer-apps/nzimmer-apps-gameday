import { describe, expect, it } from 'vitest';
import { describeTurnover, finalPlayText, parseFumble, parseFumbles, parseInterception, parseTurnovers } from './turnovers';

// Play texts copied from ESPN's feed (week 10, 2026).
const LOST =
  '(No Huddle, Shotgun) J.Love pass short right to M.Redman to GB 9 for 4 yards (A.Van Ginkel) [L.Rodriguez]. FUMBLES (A.Van Ginkel), RECOVERED by MIN-A.Van Ginkel at GB 10.';
const OWN =
  'T.DeVito pass short right to R.Gilliam to NE 19 for 6 yards (C.Clark). FUMBLES (C.Clark), recovered by NE-A.Brown at NE 25.';
const REVERSED =
  '(Shotgun) K.Cousins pass short middle intended for J.Mason INTERCEPTED by L.Van Ness (B.Sorrell) [K.Brooks] at GB 21. L.Van Ness to GB 21 for no gain (J.Huber).The Replay Official reviewed the passer was not down by contact ruling, and the play was REVERSED.(Shotgun) K.Cousins sacked at GB 25 for -5 yards (K.Brooks).';

describe('parseFumble', () => {
  it('reads fumbler, forcer and recovery on a lost fumble', () => {
    expect(parseFumble(LOST, 'GB')).toEqual({
      kind: 'fumble',
      muffed: false,
      fumbledBy: 'M.Redman',
      forcedBy: 'A.Van Ginkel',
      recoveredBy: 'A.Van Ginkel',
      recoveredTeam: 'MIN',
      lost: true,
      team: 'GB',
    });
  });

  it('marks an own recovery as not lost', () => {
    const f = parseFumble(OWN, 'NE')!;
    expect(f.fumbledBy).toBe('R.Gilliam');
    expect(f.forcedBy).toBe('C.Clark');
    expect(f.recoveredBy).toBe('A.Brown');
    expect(f.lost).toBe(false);
  });

  it('uses the name written right before FUMBLES', () => {
    const f = parseFumble(
      '(Shotgun) J.Jacobs up the middle to DET 30 for 3 yards. J.Jacobs FUMBLES (A.Hutchinson), recovered by DET-J.Campbell at DET 31.',
      'GB',
    )!;
    expect(f).toMatchObject({ fumbledBy: 'J.Jacobs', forcedBy: 'A.Hutchinson', recoveredTeam: 'DET', lost: true });
  });

  it('handles sacks, aborted snaps and out of bounds', () => {
    expect(parseFumble('(Shotgun) J.Love sacked at GB 30 for -8 yards (B.Burns). FUMBLES (B.Burns), recovered by GB-Z.Tom at GB 28.', 'GB')).toMatchObject({
      fumbledBy: 'J.Love',
      forcedBy: 'B.Burns',
      lost: false,
    });
    expect(parseFumble('(Shotgun) J.Love FUMBLES (Aborted) at GB 40, ball out of bounds at GB 35.', 'GB')).toMatchObject({
      fumbledBy: 'J.Love',
      forcedBy: 'Aborted',
      outOfBounds: true,
      lost: false,
    });
  });

  it('handles a muffed punt', () => {
    const f = parseFumble('M.Araiza punts 50 yards to GB 20, Center-R.DiCarlo. R.Doubs MUFFS catch, recovered by KC-J.Watson at GB 22.', 'KC')!;
    expect(f).toMatchObject({ muffed: true, fumbledBy: 'R.Doubs', recoveredTeam: 'KC' });
  });

  it('ignores plays without a fumble', () => {
    expect(parseFumble('J.Love pass short left to J.Reed to GB 40 for 5 yards (B.Murphy).')).toBeNull();
  });
});

describe('more ESPN formats', () => {
  it('treats "and recovers" as the fumbler falling on it', () => {
    expect(parseFumble('(No Huddle, Shotgun) C.Ward to TEN 24 for -5 yards. FUMBLES, and recovers at TEN 17. C.Ward pass incomplete deep right [M.Murphy].', 'TEN')).toMatchObject({
      fumbledBy: 'C.Ward',
      recoveredBy: 'C.Ward',
      recoveredTeam: 'TEN',
      lost: false,
    });
  });

  it('finds the punt returner and maps old team codes', () => {
    const t =
      'C.Bojorquez punts 57 yards to NO 23, Center-R.Sunahara. B.Brown to NO 20 for -3 yards (A.Huntington). FUMBLES (A.Huntington), RECOVERED by CLV-D.McMillon at NO 19. ** Injury Update: CLV-M.Burton has returned to the game.';
    // Browns punt (offense CLE); the Saints returner fumbles and Cleveland recovers, so New Orleans lost it.
    expect(parseFumble(t, 'CLE', 'NO')).toMatchObject({ fumbledBy: 'B.Brown', forcedBy: 'A.Huntington', recoveredBy: 'D.McMillon', recoveredTeam: 'CLE', lost: true });
  });

  it('marks a kick returner who recovers his own muff as kept', () => {
    expect(parseFumble('H.Butker kicks 59 yards from KC 35 to DEN 6. M.Mims MUFFS catch, and recovers at DEN 11. M.Mims to DEN 34 for 23 yards (C.McDonald; J.Ott).', 'KC', 'DEN')).toMatchObject({
      muffed: true,
      fumbledBy: 'M.Mims',
      recoveredTeam: 'DEN',
      lost: false,
    });
  });

  it('skips eligibility notes and a leading clock', () => {
    expect(finalPlayText('(7:28) H.Nourzad reported in as eligible.  J.Fields up the middle to KC 34 for no gain (K.Enagbare).')).toBe(
      'J.Fields up the middle to KC 34 for no gain (K.Enagbare).',
    );
  });
});

describe('several fumbles in one play', () => {
  it('follows the ball back and forth', () => {
    const t =
      '(Shotgun) J.Daniels pass short middle to C.Okonkwo to LA 11 for 20 yards (J.McCollough). FUMBLES (J.McCollough), recovered by WAS-R.White at LA 15. R.White to LA 17 for -2 yards (Q.Lake). FUMBLES (Q.Lake), RECOVERED by LA-B.Young at LA 21.';
    const [a, b] = parseFumbles(t, 'WSH', 'LAR');
    expect(a).toMatchObject({ fumbledBy: 'C.Okonkwo', recoveredBy: 'R.White', recoveredTeam: 'WSH', lost: false });
    expect(b).toMatchObject({ fumbledBy: 'R.White', forcedBy: 'Q.Lake', recoveredBy: 'B.Young', recoveredTeam: 'LAR', lost: true });
  });

  it('counts a fumble out of the end zone as lost', () => {
    const t =
      'B.Mayfield to ATL 17 for -2 yards. FUMBLES, and recovers at ATL 18. B.Mayfield to ATL 16 for 2 yards. Lateral to B.Irving to ATL 1 for 15 yards (J.Bates). FUMBLES (J.Bates), ball out of bounds in End Zone, Touchback.';
    const [a, b] = parseFumbles(t, 'TB', 'ATL');
    expect(a).toMatchObject({ fumbledBy: 'B.Mayfield', lost: false });
    expect(b).toMatchObject({ fumbledBy: 'B.Irving', forcedBy: 'J.Bates', touchback: true, lost: true, recoveredTeam: 'ATL' });
  });
});

describe('parseInterception', () => {
  it('reads passer, target and defender', () => {
    expect(
      parseInterception('(Shotgun) J.Goff pass deep left intended for A.St. Brown INTERCEPTED by C.Gonzalez at NE 39. C.Gonzalez to NE 39 for no gain (I.TeSlaa).'),
    ).toEqual({ kind: 'interception', passer: 'J.Goff', intendedFor: 'A.St. Brown', interceptedBy: 'C.Gonzalez' });
  });
});

describe('names next to all-caps words', () => {
  it('stops a name before INTERCEPTED or a team code', () => {
    expect(parseInterception(' (Shotgun) K.Cousins pass deep left intended for T.Felton INTERCEPTED by X.McKinney at GB 16. X.McKinney ran ob at GB 16 for no gain.')).toEqual({
      kind: 'interception',
      passer: 'K.Cousins',
      intendedFor: 'T.Felton',
      interceptedBy: 'X.McKinney',
    });
  });
});

describe('replay reversals', () => {
  it('uses only the result that stands', () => {
    expect(finalPlayText(REVERSED)).toBe('(Shotgun) K.Cousins sacked at GB 25 for -5 yards (K.Brooks).');
    expect(parseTurnovers(REVERSED)).toEqual([]);
  });
});

describe('describeTurnover', () => {
  it('writes a readable line', () => {
    expect(describeTurnover(parseFumble(LOST, 'GB')!)).toBe('Fumble by M.Redman, forced by A.Van Ginkel, recovered by A.Van Ginkel (MIN)');
  });
});
