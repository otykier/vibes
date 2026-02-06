-- Row Level Security: lock down direct table access, allow SELECT for Realtime

-- Sessions table: no direct access for anon (all access via RPC)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Session parts: allow SELECT for Realtime subscriptions
-- session_id is a UUID only discoverable via the slug through get_session RPC
ALTER TABLE session_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read by session_id" ON session_parts
  FOR SELECT USING (true);

-- Grant execute on RPC functions to anon role
GRANT EXECUTE ON FUNCTION create_session(text, text, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION get_session(text) TO anon;
GRANT EXECUTE ON FUNCTION increment_found(text, int, int) TO anon;
GRANT EXECUTE ON FUNCTION reset_session(text) TO anon;

-- Enable Realtime for session_parts table
ALTER PUBLICATION supabase_realtime ADD TABLE session_parts;
