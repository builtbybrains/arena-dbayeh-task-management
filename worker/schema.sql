-- Shared data for Arena OS. Every app record (user, task, event, walk-in, …) is
-- one row: collection + id + JSON. `rev` increases with every write so phones
-- can ask "what changed since rev N?".
CREATE TABLE IF NOT EXISTS records (
  c TEXT NOT NULL,
  id TEXT NOT NULL,
  d TEXT,
  rev INTEGER NOT NULL,
  PRIMARY KEY (c, id)
);
CREATE INDEX IF NOT EXISTS records_rev ON records(rev);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
INSERT OR IGNORE INTO meta (k, v) VALUES ('rev', '0'), ('epoch', '1');
