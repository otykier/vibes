import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { fetchSet, fetchSetParts } from '../lib/rebrickable';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [setNum, setSetNum] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!setNum.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const [setInfo, parts] = await Promise.all([
        fetchSet(setNum.trim()),
        fetchSetParts(setNum.trim()),
      ]);

      const slug = nanoid(12);

      const { error: rpcError } = await supabase.rpc('create_session', {
        p_slug: slug,
        p_set_num: setInfo.set_num,
        p_set_name: setInfo.name,
        p_set_img_url: setInfo.set_img_url,
        p_parts: parts,
      });

      if (rpcError) throw new Error(rpcError.message);

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
          placeholder="Enter set number (e.g. 42100)"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !setNum.trim()}>
          {loading ? 'Loading...' : 'Go!'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

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
    </div>
  );
}
