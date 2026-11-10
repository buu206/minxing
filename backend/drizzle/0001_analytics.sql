CREATE TABLE IF NOT EXISTS analytics_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('page_open','home_entered','culture_started','ai_reply_success','ai_reply_failure')),
  detail TEXT NOT NULL DEFAULT '',
  occurred_at INTEGER NOT NULL,
  day TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_events_day_type_visitor ON analytics_events(day,event_type,visitor_id);
CREATE INDEX IF NOT EXISTS analytics_events_visitor_day ON analytics_events(visitor_id,day);
CREATE TABLE IF NOT EXISTS analytics_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
