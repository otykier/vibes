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
      <h1>BrickCheck</h1>
      <p>Look up a Lego set and collaboratively check off pieces.</p>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={setNum}
          onChange={(e) => setSetNum(e.target.value)}
          placeholder="Enter set number (e.g. 42100)"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !setNum.trim()}>
          {loading ? 'Loading...' : 'Start Session'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
