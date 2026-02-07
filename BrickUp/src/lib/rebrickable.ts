import type { RebrickableSet, RebrickablePart } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export async function fetchSetWithParts(setNum: string): Promise<{ set: RebrickableSet; parts: RebrickablePart[] }> {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/rebrickable?set_num=${encodeURIComponent(setNum)}`
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `Edge function error: ${res.status}`);
  }

  return res.json();
}
