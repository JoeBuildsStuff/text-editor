PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  document_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sort_order REAL NOT NULL DEFAULT 0,
  UNIQUE(user_id, document_path)
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  folder_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sort_order REAL NOT NULL DEFAULT 0,
  UNIQUE(user_id, folder_path)
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(user_id, document_path);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(user_id, folder_path);

CREATE TABLE IF NOT EXISTS comment_threads (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved')),
  anchor_from INTEGER NOT NULL,
  anchor_to INTEGER NOT NULL,
  anchor_exact TEXT NOT NULL DEFAULT '',
  anchor_prefix TEXT NOT NULL DEFAULT '',
  anchor_suffix TEXT NOT NULL DEFAULT '',
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comment_threads_document_id ON comment_threads(document_id);
CREATE INDEX IF NOT EXISTS idx_comment_threads_status ON comment_threads(document_id, status);
CREATE INDEX IF NOT EXISTS idx_comments_thread_id ON comments(thread_id);
