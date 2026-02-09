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

      <div className="home-footer-links">
        <a href="https://github.com/otykier/vibes" target="_blank" rel="noopener noreferrer" title="GitHub">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.337-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
        </a>
        <a href="https://www.linkedin.com/in/dotykier/" target="_blank" rel="noopener noreferrer" title="LinkedIn">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
        </a>
      </div>
    </div>
  );
}
