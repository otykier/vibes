import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { fetchSetWithParts } from '../lib/rebrickable';
import { supabase } from '../lib/supabase';
import { getRecentSessions, saveRecentSession, timeAgo, type RecentSession } from '../lib/recentSessions';

export default function Home() {
  const [setNum, setSetNum] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    setRecentSessions(getRecentSessions());
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!setNum.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const { set: setInfo, parts } = await fetchSetWithParts(setNum.trim());

      const slug = nanoid(12);

      const { error: rpcError } = await supabase.rpc('create_session', {
        p_slug: slug,
        p_set_num: setInfo.set_num,
        p_set_name: setInfo.name,
        p_set_img_url: setInfo.set_img_url,
        p_parts: parts,
      });

      if (rpcError) throw new Error(rpcError.message);

      const totalNeeded = parts.filter((p) => !p.is_spare).reduce((sum, p) => sum + p.qty_needed, 0);
      saveRecentSession({
        slug,
        set_num: setInfo.set_num,
        set_name: setInfo.name,
        set_img_url: setInfo.set_img_url,
        totalFound: 0,
        totalNeeded,
      });
      setRecentSessions(getRecentSessions());

      navigate(`/s/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="home">
      <h1>BrickUp</h1>
      <p className="tagline">Collaborative LEGO set inventory checklist</p>

      <div className="home-description">
        <p>Enter a LEGO set number to get a checklist of every piece. Share the link and check off bricks together in real-time — perfect for sorting through a pile of loose bricks with friends or family.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={setNum}
          onChange={(e) => setSetNum(e.target.value)}
          placeholder="Enter set number (e.g. 10713)"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !setNum.trim()}>
          {loading ? 'Loading...' : 'Go!'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {recentSessions.length > 0 && (
        <div className="recent-sessions">
          <h2>Recent sessions</h2>
          {recentSessions.map((s) => {
            const pct = s.totalNeeded > 0 ? Math.round((s.totalFound / s.totalNeeded) * 100) : 0;
            return (
              <Link key={s.slug} to={`/s/${s.slug}`} className="recent-session-card">
                {s.set_img_url ? (
                  <img src={s.set_img_url} alt={s.set_name} className="recent-session-img" />
                ) : (
                  <div className="recent-session-img-placeholder" />
                )}
                <div className="recent-session-text">
                  <span className="recent-session-name">{s.set_name}</span>
                  <span className="recent-session-num">{s.set_num}</span>
                  {s.totalNeeded > 0 && (
                    <div className="recent-session-progress">
                      <div className="recent-session-progress-bar">
                        <div className="recent-session-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="recent-session-pct">{pct}%</span>
                    </div>
                  )}
                </div>
                <div className="recent-session-meta">
                  <span
                    className="recent-session-time"
                    title={new Date(s.timestamp).toLocaleString()}
                  >
                    {timeAgo(s.timestamp)}
                  </span>
                  <span className="recent-session-arrow">&#8250;</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="home-features">
        <div className="feature">
          <strong>Real-time sync</strong>
          <span>Multiple people can check off pieces simultaneously</span>
        </div>
        <div className="feature">
          <strong>QR sharing</strong>
          <span>Share via link or QR code — no accounts needed</span>
        </div>
        <div className="feature">
          <strong>Sort &amp; filter</strong>
          <span>Organize by color, category, or completion status</span>
        </div>
      </div>

      <a
        className="powered-by"
        href="https://rebrickable.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>Powered by</span>
        <img src="https://rebrickable.com/static/img/title.png" alt="Rebrickable" />
      </a>

      <div className="home-footer">
        <span>Made by Daniel Otykier</span>
        <div className="home-footer-links">
          <a href="https://github.com/otykier" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="https://www.linkedin.com/in/dotykier/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        </div>
      </div>
    </div>
  );
}
