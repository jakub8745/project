CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  blob_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('visitor', 'blob')),
  content TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('visitor', 'collision')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
  ON chat_messages (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_blob_created
  ON chat_messages (blob_id, created_at DESC);

CREATE TABLE IF NOT EXISTS surface_prints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  blob_id TEXT NOT NULL,
  blob_label TEXT NOT NULL,
  text TEXT NOT NULL,
  surface TEXT NOT NULL CHECK (surface IN ('north', 'south', 'east', 'west', 'floor')),
  u REAL NOT NULL,
  v REAL NOT NULL,
  rotation REAL NOT NULL,
  scale REAL NOT NULL,
  color TEXT NOT NULL,
  opacity REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (message_id) REFERENCES chat_messages(id)
);

CREATE INDEX IF NOT EXISTS idx_surface_prints_created
  ON surface_prints (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_surface_prints_surface
  ON surface_prints (surface, created_at DESC);
