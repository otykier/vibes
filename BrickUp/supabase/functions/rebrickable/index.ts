import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://rebrickable.com/api/v3";

interface RebrickablePart {
  part_num: string;
  part_name: string;
  part_img_url: string | null;
  color_id: number;
  color_name: string;
  color_rgb: string;
  element_id: string | null;
  category: string | null;
  qty_needed: number;
  is_spare: boolean;
}

function normalizeSetNum(input: string): string {
  return input.includes("-") ? input : `${input}-1`;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("REBRICKABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "REBRICKABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const setNumInput = url.searchParams.get("set_num");
    if (!setNumInput) {
      return new Response(JSON.stringify({ error: "Missing set_num parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const setNum = normalizeSetNum(setNumInput);

    // Fetch set info
    const setRes = await fetch(`${API_BASE}/lego/sets/${setNum}/?key=${apiKey}`);
    if (!setRes.ok) {
      if (setRes.status === 404) {
        return new Response(JSON.stringify({ error: `Set ${setNum} not found` }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Rebrickable API error: ${setRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const setData = await setRes.json();

    // Fetch all parts (paginated)
    const parts: RebrickablePart[] = [];
    let partsUrl: string | null = `${API_BASE}/lego/sets/${setNum}/parts/?key=${apiKey}&page_size=1000`;

    while (partsUrl) {
      const partsRes = await fetch(partsUrl);
      if (!partsRes.ok) {
        return new Response(JSON.stringify({ error: `Rebrickable API error: ${partsRes.status}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const partsData = await partsRes.json();

      for (const item of partsData.results) {
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

      partsUrl = partsData.next;
    }

    // Aggregate duplicates (same part_num + color_id + is_spare)
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

    const result = {
      set: {
        set_num: setData.set_num,
        name: setData.name,
        set_img_url: setData.set_img_url,
      },
      parts: Array.from(map.values()),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
