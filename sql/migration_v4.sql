-- ShelfSpace v4 migration: reading goals + notes/highlights.
-- Run this on an EXISTING database that already has migration_v3 applied.
-- It does not delete data.

ALTER TABLE users
  ADD COLUMN reading_goal INT NULL;

CREATE TABLE IF NOT EXISTS entry_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entry_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  page INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_entry_notes_entry ON entry_notes (entry_id);
