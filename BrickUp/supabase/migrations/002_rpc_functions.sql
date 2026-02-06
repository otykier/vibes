-- RPC functions: all client-facing operations go through these SECURITY DEFINER functions

-- Create a new session with all its parts
CREATE OR REPLACE FUNCTION create_session(
  p_slug text,
  p_set_num text,
  p_set_name text,
  p_set_img_url text,
  p_parts jsonb
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

-- Load a session by slug (returns session info + all parts as JSON)
CREATE OR REPLACE FUNCTION get_session(p_slug text)
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

-- Increment (or decrement) the found count for a part, clamped to [0, qty_needed]
CREATE OR REPLACE FUNCTION increment_found(p_slug text, p_part_id int, p_delta int DEFAULT 1)
RETURNS jsonb AS $$
  UPDATE session_parts sp
  SET qty_found = GREATEST(0, LEAST(sp.qty_found + p_delta, sp.qty_needed))
  FROM sessions s
  WHERE s.id = sp.session_id
    AND s.slug = p_slug
    AND sp.id = p_part_id
  RETURNING jsonb_build_object('id', sp.id, 'qty_found', sp.qty_found);
$$ LANGUAGE sql SECURITY DEFINER;

-- Reset all found counts for a session
CREATE OR REPLACE FUNCTION reset_session(p_slug text)
RETURNS void AS $$
  UPDATE session_parts sp SET qty_found = 0
  FROM sessions s
  WHERE s.id = sp.session_id AND s.slug = p_slug;
$$ LANGUAGE sql SECURITY DEFINER;
