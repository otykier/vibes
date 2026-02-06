import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { SessionData, SessionPart } from '../types';

export function useSession(slug: string | undefined) {
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    async function load() {
      setLoading(true);
      setError(null);
      const { data: result, error: err } = await supabase.rpc('get_session', { p_slug: slug });
      if (err) {
        setError(err.message);
      } else if (!result) {
        setError('Session not found');
      } else {
        setData(result as SessionData);
      }
      setLoading(false);
    }

    load();
  }, [slug]);

  // Subscribe to realtime updates on session_parts
  useEffect(() => {
    if (!data?.session.id) return;

    const channel = supabase
      .channel(`session:${data.session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'session_parts',
          filter: `session_id=eq.${data.session.id}`,
        },
        (payload) => {
          const updated = payload.new as SessionPart;
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              parts: prev.parts.map((p) =>
                p.id === updated.id ? { ...p, qty_found: updated.qty_found } : p
              ),
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [data?.session.id]);

  const incrementFound = useCallback(
    async (partId: number, delta: number = 1) => {
      if (!slug) return;
      const { error: err } = await supabase.rpc('increment_found', {
        p_slug: slug,
        p_part_id: partId,
        p_delta: delta,
      });
      if (err) console.error('increment_found error:', err.message);
    },
    [slug]
  );

  const resetSession = useCallback(async () => {
    if (!slug) return;
    const { error: err } = await supabase.rpc('reset_session', { p_slug: slug });
    if (err) console.error('reset_session error:', err.message);
  }, [slug]);

  return { data, loading, error, incrementFound, resetSession };
}
