import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const globalForAuthDb = globalThis as unknown as {
  authDb?: DatabaseType;
};

function createDatabase(): DatabaseType {
  const databaseFile = process.env.AUTH_SQLITE_PATH ?? path.join(process.cwd(), "server", "auth.sqlite");
  
  // Ensure the server directory exists
  const serverDir = path.dirname(databaseFile);
  mkdir(serverDir, { recursive: true }).catch(() => {
    // Ignore errors if directory already exists
  });
  
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

    -- Admin roles are tracked separately so we don't disturb the Better Auth schema
    CREATE TABLE IF NOT EXISTS admin_roles (
      user_id TEXT PRIMARY KEY,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    -- Admin audit log for privileged actions
    CREATE TABLE IF NOT EXISTS admin_actions (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_user_id TEXT,
      ip TEXT,
      user_agent TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_actions_actor_created_at ON admin_actions(actor_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_actions_target_created_at ON admin_actions(target_user_id, created_at DESC);
  `);
  return db;
}

export function getAuthDb(): DatabaseType {
  if (!globalForAuthDb.authDb) {
    globalForAuthDb.authDb = createDatabase();
  }
  return globalForAuthDb.authDb;
}
