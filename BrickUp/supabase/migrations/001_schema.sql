-- BrickUp schema: sessions and session_parts tables

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  set_num text NOT NULL,
  set_name text NOT NULL,
  set_img_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE session_parts (
  id serial PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  part_num text NOT NULL,
  part_name text NOT NULL,
  part_img_url text,
  color_id int NOT NULL,
  color_name text NOT NULL,
  color_rgb text NOT NULL,
  element_id text,
  category text,
  qty_needed int NOT NULL,
  qty_found int NOT NULL DEFAULT 0,
  is_spare boolean DEFAULT false,
  UNIQUE(session_id, part_num, color_id, is_spare)
);

CREATE INDEX idx_session_parts_session ON session_parts(session_id);
CREATE INDEX idx_sessions_slug ON sessions(slug);
