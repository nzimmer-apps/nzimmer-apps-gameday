import { useEffect } from 'react';
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSettings } from './lib/hooks';
import { LeagueProvider, useLeague } from './lib/league';
import { Game } from './pages/Game';
import { Leaders } from './pages/Leaders';
import { Player } from './pages/Player';
import { Scoreboard } from './pages/Scoreboard';
import { Settings } from './pages/Settings';
import { Conference, Division, LeagueHome } from './pages/Standings';
import { Team } from './pages/Team';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function ThemeSync() {
  const { theme } = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
  return null;
}

function BottomNav() {
  const { favorites } = useSettings();
  const league = useLeague();
  const fav = league.byAbbr[favorites[0]];
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end>
        <span className="ico">🏈</span>Scores
      </NavLink>
      <NavLink to="/nfl" end>
        <span className="ico">📊</span>Standings
      </NavLink>
      <NavLink to="/nfl/leaders">
        <span className="ico">🏆</span>Leaders
      </NavLink>
      {fav && (
        <NavLink to={`/nfl/team/${fav.slug}`}>
          <img className="ico-img" src={fav.logo} alt="" width={22} height={22} />
          {fav.short}
        </NavLink>
      )}
      <NavLink to="/settings">
        <span className="ico">⚙️</span>Settings
      </NavLink>
    </nav>
  );
}

export default function App() {
  return (
    <HashRouter>
      <LeagueProvider>
        <ScrollTop />
        <ThemeSync />
        <header className="top-bar">
          <Link to="/" className="brand">
            SportsScores<span>byZim</span>
          </Link>
        </header>
        <main className="wrap">
          <Routes>
            <Route path="/" element={<Scoreboard />} />
            <Route path="/nfl" element={<LeagueHome />} />
            <Route path="/nfl/week/:year/:type/:week" element={<Scoreboard />} />
            <Route path="/nfl/game/:id" element={<Game />} />
            <Route path="/nfl/team/:abbr" element={<Team />} />
            <Route path="/nfl/player/:id" element={<Player />} />
            <Route path="/nfl/leaders" element={<Leaders />} />
            <Route path="/nfl/:conf" element={<Conference />} />
            <Route path="/nfl/:conf/:div" element={<Division />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <BottomNav />
      </LeagueProvider>
    </HashRouter>
  );
}
