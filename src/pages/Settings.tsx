import { Section } from '../components/ui';
import { toggleFavorite, updateSettings, useSettings, type Theme } from '../lib/hooks';
import { useLeague } from '../lib/league';

export function Settings() {
  const league = useLeague();
  const { favorites, theme } = useSettings();
  const teams = [...league.teams].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <Section title="My teams">
        <p className="small muted">Your teams' games show first on Scores, and their rows are highlighted in standings and leaders.</p>
        <div className="fav-grid">
          {teams.map((t) => (
            <button key={t.id} className={`fav-pick ${favorites.includes(t.abbr) ? 'on' : ''}`} style={{ ['--tc' as string]: t.color }} onClick={() => toggleFavorite(t.abbr)}>
              <img src={t.logo} alt="" width={36} height={36} />
              <span>{t.short}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Appearance">
        <div className="chips">
          {(['system', 'dark', 'light'] as Theme[]).map((v) => (
            <button key={v} className={`chip ${theme === v ? 'on' : ''}`} onClick={() => updateSettings({ theme: v })}>
              {v === 'system' ? 'Match phone' : v === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
      </Section>
      <Section title="About">
        <p className="small muted">
          SportsScoresbyZim. Personal use only. Data comes from ESPN's public feed and refreshes every 15 seconds while a game is live. Not affiliated with
          ESPN or the NFL.
        </p>
      </Section>
    </div>
  );
}
