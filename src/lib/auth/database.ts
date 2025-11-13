import Database from "better-sqlite3";

const globalForAuthDb = globalThis as unknown as {
  authDb?: Database;
};

function createDatabase(): Database {
  const databaseFile = process.env.AUTH_SQLITE_PATH ?? "auth.sqlite";
  const db = new Database(databaseFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      remember_me INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
  `);
  return db;
}

export function getAuthDb(): Database {
  if (!globalForAuthDb.authDb) {
    globalForAuthDb.authDb = createDatabase();
  }
  return globalForAuthDb.authDb;
}
