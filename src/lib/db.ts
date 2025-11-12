import Database from "better-sqlite3"
import path from "node:path"
import { mkdir } from "node:fs/promises"

const DB_PATH = path.join(process.cwd(), "server", "documents.db")

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (db) {
    return db
  }

  // Ensure the server directory exists
  const serverDir = path.dirname(DB_PATH)
  mkdir(serverDir, { recursive: true }).catch(() => {
    // Ignore errors if directory already exists
  })

  db = new Database(DB_PATH)
  
  // Enable foreign keys
  db.pragma("foreign_keys = ON")
  
  // Initialize schema
  initializeSchema(db)
  
  return db
}

function initializeSchema(database: Database.Database) {
  // Create documents table
  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      document_path TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      folder_path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(document_path);
    CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(folder_path);
  `)
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}

