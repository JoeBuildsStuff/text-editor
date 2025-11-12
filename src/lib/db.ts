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
  // Create documents table (metadata only - content stored in files)
  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      document_path TEXT NOT NULL UNIQUE,
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
  
  // Migrate old schema if content column exists
  try {
    const tableInfo = database.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>
    const hasContentColumn = tableInfo.some(col => col.name === "content")
    
    if (hasContentColumn) {
      // Create new table without content column
      database.exec(`
        CREATE TABLE IF NOT EXISTS documents_new (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          document_path TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        
        INSERT INTO documents_new (id, title, document_path, created_at, updated_at)
        SELECT id, title, document_path, created_at, updated_at FROM documents;
        
        DROP TABLE documents;
        ALTER TABLE documents_new RENAME TO documents;
        
        CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(document_path);
      `)
    }
  } catch (error) {
    // Migration failed, but schema is already correct
    console.warn("Schema migration check failed:", error)
  }
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}

