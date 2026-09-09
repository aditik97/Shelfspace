-- ShelfSpace v3 migration: discovery, access and reading-progress metadata.
-- Run this on an EXISTING ShelfSpace database. It does not delete data.
USE shelfspace;

ALTER TABLE entries
  ADD COLUMN external_id VARCHAR(255) NULL,
  ADD COLUMN external_source VARCHAR(50) NULL,
  ADD COLUMN isbn VARCHAR(32) NULL,
  ADD COLUMN publication_year INT NULL,
  ADD COLUMN access_type VARCHAR(30) NULL,
  ADD COLUMN read_url VARCHAR(500) NULL,
  ADD COLUMN buy_url VARCHAR(500) NULL,
  ADD COLUMN progress_percent INT NOT NULL DEFAULT 0,
  ADD COLUMN current_page INT NULL,
  ADD COLUMN total_pages INT NULL,
  ADD COLUMN date_started DATE NULL;

CREATE INDEX idx_entries_external ON entries (user_id, external_source, external_id);
CREATE INDEX idx_entries_status ON entries (user_id, status);
