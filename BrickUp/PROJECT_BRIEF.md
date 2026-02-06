# BrickCheck — Collaborative Lego Set Inventory Checklist

## Concept

A web app that lets you look up a Lego set by number, displays a checklist of all elements in that set, and lets you (and others) tap elements to mark them as "found" while sorting through a pile of loose bricks. Multiple people can collaborate on the same checklist in real-time via a shared URL.

## Core User Flow

1. User enters a Lego set number (e.g. `42100`)
2. App fetches the set's part inventory from the Rebrickable API
3. A new collaborative session is created with a unique, unguessable slug URL
4. The app displays a grid/list of elements showing: part thumbnail image, color swatch, part name, and quantity needed vs. found
5. User taps an element to increment the "found" count by 1, or enters a number to increment by that amount
6. Other users can join via the slug URL and see/make updates in real-time
7. A progress bar or summary shows overall completion (e.g. "147/302 pieces found")
8. Users can sort by: color, element category/type, completion status
9. Users can filter by: color, element category/type, found/not-found/complete

## Tech Stack

- **Frontend:** React (single-page app, mobile-first responsive design)
- **Backend/Database:** Supabase (Postgres + Realtime + RPC functions — no custom server needed)
- **Data Source:** Rebrickable API (https://rebrickable.com/api/v3/) for set inventories, part images, and color data
- **Hosting:** Frontend on Vercel, Netlify, or served as static files. Supabase free tier for backend.

## Architecture

### No Traditional Backend

There is no Express/Node server. The React app talks directly to Supabase (for session storage and real-time sync) and to the Rebrickable API (for set/part data lookups). All write operations go through Supabase RPC (Postgres functions) to enforce access control.

### Security Model: Capability URLs

- Each session gets a **slug** (UUID v4 or nanoid) that serves as both the URL identifier and the authorization token
- Knowing the slug = having access. No user accounts or login required.
- The Supabase `anon` role has **no direct table access** (no RLS SELECT/INSERT/UPDATE policies for anon on the tables)
- All data access goes through `SECURITY DEFINER` Postgres functions exposed via Supabase RPC
- This prevents enumeration of sessions and restricts operations to only what the functions allow

### Database Schema (Supabase/Postgres)

```sql
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,          -- the shareable capability URL token
  set_num text NOT NULL,              -- Rebrickable set number e.g. '42100-1'
  set_name text NOT NULL,             -- human-readable name
  set_img_url text,                   -- set thumbnail from Rebrickable
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE session_parts (
  id serial PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  part_num text NOT NULL,             -- Rebrickable part number
  part_name text NOT NULL,
  part_img_url text,                  -- part thumbnail from Rebrickable
  color_id int NOT NULL,              -- Rebrickable color ID
  color_name text NOT NULL,
  color_rgb text NOT NULL,            -- hex color e.g. '05131D'
  element_id text,                    -- Lego element ID if available
  category text,                      -- part category for grouping/filtering
  qty_needed int NOT NULL,
  qty_found int NOT NULL DEFAULT 0,
  is_spare boolean DEFAULT false,     -- Rebrickable marks some parts as spares
  UNIQUE(session_id, part_num, color_id)
);

CREATE INDEX idx_session_parts_session ON session_parts(session_id);
CREATE INDEX idx_sessions_slug ON sessions(slug);
```

### Supabase RPC Functions

All client-facing operations are Postgres functions. The `anon` role can only call these — no direct table access.

```sql
-- Create a new session (called after fetching set data from Rebrickable on the client)
CREATE FUNCTION create_session(
  p_slug text,
  p_set_num text,
  p_set_name text,
  p_set_img_url text,
  p_parts jsonb  -- array of {part_num, part_name, part_img_url, color_id, color_name, color_rgb, element_id, category, qty_needed, is_spare}
)
RETURNS uuid AS $$
DECLARE
  v_session_id uuid;
BEGIN
  INSERT INTO sessions (slug, set_num, set_name, set_img_url)
  VALUES (p_slug, p_set_num, p_set_name, p_set_img_url)
  RETURNING id INTO v_session_id;

  INSERT INTO session_parts (session_id, part_num, part_name, part_img_url, color_id, color_name, color_rgb, element_id, category, qty_needed, is_spare)
  SELECT v_session_id, p->>'part_num', p->>'part_name', p->>'part_img_url',
         (p->>'color_id')::int, p->>'color_name', p->>'color_rgb',
         p->>'element_id', p->>'category', (p->>'qty_needed')::int,
         COALESCE((p->>'is_spare')::boolean, false)
  FROM jsonb_array_elements(p_parts) AS p;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Load a session by slug
CREATE FUNCTION get_session(p_slug text)
RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'session', jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'set_num', s.set_num,
      'set_name', s.set_name, 'set_img_url', s.set_img_url,
      'created_at', s.created_at
    ),
    'parts', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id, 'part_num', p.part_num, 'part_name', p.part_name,
          'part_img_url', p.part_img_url, 'color_id', p.color_id,
          'color_name', p.color_name, 'color_rgb', p.color_rgb,
          'element_id', p.element_id, 'category', p.category,
          'qty_needed', p.qty_needed, 'qty_found', p.qty_found,
          'is_spare', p.is_spare
        ) ORDER BY p.color_name, p.part_name
      )
      FROM session_parts p WHERE p.session_id = s.id
    ), '[]'::jsonb)
  )
  FROM sessions s WHERE s.slug = p_slug;
$$ LANGUAGE sql SECURITY DEFINER;

-- Increment found count (clamped to qty_needed)
CREATE FUNCTION increment_found(p_slug text, p_part_id int, p_delta int DEFAULT 1)
RETURNS jsonb AS $$
  UPDATE session_parts sp
  SET qty_found = GREATEST(0, LEAST(sp.qty_found + p_delta, sp.qty_needed)),
      -- GREATEST(0,...) handles negative deltas for decrementing
      session_id = sp.session_id  -- no-op to trigger updated_at if you add a trigger
  FROM sessions s
  WHERE s.id = sp.session_id
    AND s.slug = p_slug
    AND sp.id = p_part_id
  RETURNING jsonb_build_object('id', sp.id, 'qty_found', sp.qty_found);
$$ LANGUAGE sql SECURITY DEFINER;

-- Reset all found counts for a session
CREATE FUNCTION reset_session(p_slug text)
RETURNS void AS $$
  UPDATE session_parts sp SET qty_found = 0
  FROM sessions s
  WHERE s.id = sp.session_id AND s.slug = p_slug;
$$ LANGUAGE sql SECURITY DEFINER;
```

### Real-time Sync

Supabase Realtime is used to push `session_parts` row changes to all connected clients. The client subscribes to changes filtered by `session_id` (which it learns from the initial `get_session` call). When any client calls `increment_found`, the row update is broadcast to all subscribers.

On the client side this looks roughly like:

```js
supabase
  .channel(`session:${sessionId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'session_parts',
    filter: `session_id=eq.${sessionId}`
  }, (payload) => {
    // Update local state with payload.new.qty_found
  })
  .subscribe();
```

Note: For Realtime to work with RLS, you'll need a SELECT policy on `session_parts` that allows the anon role to read rows — but only when filtered by a known `session_id`. This is acceptable because `session_id` is a UUID that's only known to users who have the slug.

```sql
ALTER TABLE session_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read by session_id" ON session_parts
  FOR SELECT USING (true);
  -- This is broad, but session_id (UUID) is unguessable without the slug.
  -- The RPC functions are the only way to discover a session_id from a slug.
  -- If tighter control is needed, use Supabase Realtime broadcast mode instead.
```

### Rebrickable API Integration

The client fetches set data from the Rebrickable API before creating a session. Key endpoints:

- `GET /api/v3/lego/sets/{set_num}/` — set metadata (name, image, etc.)
- `GET /api/v3/lego/sets/{set_num}/parts/?page_size=1000` — all parts in the set with colors, quantities, images, and categories

API key is required (free to obtain at https://rebrickable.com/api/). This key will be used client-side, so it should be treated as non-secret (Rebrickable API keys are rate-limited but not privileged). Alternatively, proxy through a Supabase Edge Function if you want to keep the key private.

Rebrickable set numbers typically have a suffix like `-1` (e.g., `42100-1`). The app should handle both `42100` and `42100-1` as input.

### Environment Variables

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key
- `VITE_REBRICKABLE_API_KEY` — Rebrickable API key

## UI/UX Notes

- **Mobile-first** — the primary use case is people around a table with phones
- The part grid should show a **color swatch** (using the hex from Rebrickable) alongside each part thumbnail
- Tapping a part **increments qty_found by 1**; long-press or secondary action opens a number input for bulk entry
- Parts with `qty_found === qty_needed` should be visually distinct (dimmed/checked off)
- Sorting/filtering controls should be easy to access but not dominate the UI
- Show a **QR code** for the session URL so others can join by scanning (use a client-side QR library)
- Show a **progress summary** (total found / total needed, percentage)
- Consider grouping spare parts separately (Rebrickable marks these with `is_spare: true`)

## Project Structure

```
brickcheck/
├── src/
│   ├── components/       # React components
│   ├── lib/
│   │   ├── supabase.ts   # Supabase client init
│   │   └── rebrickable.ts # Rebrickable API helpers
│   ├── hooks/            # Custom React hooks (useSession, useRealtime, etc.)
│   ├── pages/            # Route-level components (Home, Session)
│   ├── types/            # TypeScript interfaces
│   └── App.tsx
├── supabase/
│   └── migrations/       # SQL migration files for schema + functions
├── package.json
├── vite.config.ts
└── README.md
```

## Getting Started

1. Create a Supabase project (free tier) at https://supabase.com
2. Get a Rebrickable API key at https://rebrickable.com/api/
3. Run the SQL migrations to set up the schema, functions, and RLS policies
4. Set environment variables
5. `npm install && npm run dev`

## Future Ideas (Out of Scope for MVP)

- Session expiration / auto-cleanup of old sessions
- Part image scanning / visual search
- Offline mode with sync-on-reconnect
- Export missing parts list to BrickLink wanted list
- "Undo" support for accidental taps
- Multiple set sessions (combine parts from 2+ sets)
