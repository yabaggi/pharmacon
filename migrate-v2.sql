-- ============================================================
-- Migration v2: image attachments (D1 BLOB) + messages update
-- Run: wrangler d1 execute pharma-consult-db --remote --file=migrate-v2.sql
-- ============================================================

-- Attachments table (stores images as BLOBs in D1)
CREATE TABLE IF NOT EXISTS attachments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uploader_id  INTEGER NOT NULL REFERENCES users(id),
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  data         BLOB NOT NULL,
  size         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add attachment columns to messages (safe - skips if column exists)
ALTER TABLE messages ADD COLUMN attachment_id   INTEGER REFERENCES attachments(id);
ALTER TABLE messages ADD COLUMN attachment_type TEXT;

CREATE INDEX IF NOT EXISTS idx_attachments_uploader ON attachments(uploader_id);
