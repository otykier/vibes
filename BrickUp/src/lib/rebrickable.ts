import type { RebrickableSet, RebrickablePart } from '../types';

const API_BASE = 'https://rebrickable.com/api/v3';
const API_KEY = import.meta.env.VITE_REBRICKABLE_API_KEY;

function normalizeSetNum(input: string): string {
  // Add -1 suffix if not present (e.g. '42100' -> '42100-1')
  return input.includes('-') ? input : `${input}-1`;
}

export async function fetchSet(setNumInput: string): Promise<RebrickableSet> {
  const setNum = normalizeSetNum(setNumInput);
  const res = await fetch(`${API_BASE}/lego/sets/${setNum}/?key=${API_KEY}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Set ${setNum} not found`);
    throw new Error(`Rebrickable API error: ${res.status}`);
  }
  const data = await res.json();
  return {
    set_num: data.set_num,
    name: data.name,
    set_img_url: data.set_img_url,
  };
}

export async function fetchSetParts(setNumInput: string): Promise<RebrickablePart[]> {
  const setNum = normalizeSetNum(setNumInput);
  const parts: RebrickablePart[] = [];
  let url: string | null = `${API_BASE}/lego/sets/${setNum}/parts/?key=${API_KEY}&page_size=1000`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Rebrickable API error: ${res.status}`);
    const data = await res.json();

    for (const item of data.results) {
      parts.push({
        part_num: item.part.part_num,
        part_name: item.part.name,
        part_img_url: item.part.part_img_url,
        color_id: item.color.id,
        color_name: item.color.name,
        color_rgb: item.color.rgb,
        element_id: item.element_id,
        category: item.part.part_cat_id?.toString() ?? null,
        qty_needed: item.quantity,
        is_spare: item.is_spare,
      });
    }

    url = data.next;
  }

  // Aggregate duplicates (same part_num + color_id) by summing qty_needed
  const map = new Map<string, RebrickablePart>();
  for (const p of parts) {
    const key = `${p.part_num}:${p.color_id}:${p.is_spare}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty_needed += p.qty_needed;
    } else {
      map.set(key, { ...p });
    }
  }

  return Array.from(map.values());
}
