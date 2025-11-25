BEGIN TRANSACTION;

-- Add sort_order column with a deterministic default
ALTER TABLE documents ADD COLUMN sort_order REAL NOT NULL DEFAULT 0;
ALTER TABLE folders ADD COLUMN sort_order REAL NOT NULL DEFAULT 0;

-- Backfill any legacy NULLs just in case (SQLite populates 0 for new columns, but be defensive)
UPDATE documents SET sort_order = 0 WHERE sort_order IS NULL;
UPDATE folders SET sort_order = 0 WHERE sort_order IS NULL;

COMMIT;
