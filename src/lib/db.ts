import Database from "better-sqlite3"
import path from "node:path"
import { mkdir } from "node:fs/promises"

const DB_PATH = process.env.DOCUMENTS_SQLITE_PATH ?? path.join(process.cwd(), "server", "documents.db")

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

  db = new Database(DB_PATH, {
    timeout: 5000, // 5 second timeout for busy database
  })
  
  // Enable foreign keys and busy timeout
  db.pragma("foreign_keys = ON")
  db.pragma("busy_timeout = 5000")
  
  // Initialize schema
  initializeSchema(db)
  
  return db
}

function initializeSchema(database: Database.Database) {
  // Check if tables exist and if they need migration
  let needsMigration = false
  try {
    // Check if documents table exists and has user_id column
    const documentsTableInfo = database.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>
    const hasUserIdColumn = documentsTableInfo.length > 0 && documentsTableInfo.some(col => col.name === "user_id")
    // If table exists but doesn't have user_id, we need to migrate
    needsMigration = documentsTableInfo.length > 0 && !hasUserIdColumn
  } catch {
    // Tables don't exist yet, will be created below
    needsMigration = false
  }
  
  // Migrate existing schema to add user_id if needed
  if (needsMigration) {
    try {
      // Add user_id column (nullable first, then update, then make NOT NULL via table recreation)
      // For existing data, we'll set a placeholder that will be filtered out
      database.exec(`
        ALTER TABLE documents ADD COLUMN user_id TEXT;
        ALTER TABLE folders ADD COLUMN user_id TEXT;
      `)
      
      // Set placeholder for existing data (these will be filtered out in queries)
      database.prepare("UPDATE documents SET user_id = 'MIGRATION_PLACEHOLDER' WHERE user_id IS NULL").run()
      database.prepare("UPDATE folders SET user_id = 'MIGRATION_PLACEHOLDER' WHERE user_id IS NULL").run()
      
      // Recreate tables with NOT NULL constraint and proper indexes
      database.exec(`
        -- Recreate documents table with user_id NOT NULL
        CREATE TABLE documents_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          document_path TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, document_path)
        );
        
        INSERT INTO documents_new SELECT * FROM documents;
        DROP TABLE documents;
        ALTER TABLE documents_new RENAME TO documents;
        
        -- Recreate folders table with user_id NOT NULL
        CREATE TABLE folders_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          folder_path TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, folder_path)
        );
        
        INSERT INTO folders_new SELECT * FROM folders;
        DROP TABLE folders;
        ALTER TABLE folders_new RENAME TO folders;
        
        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
        CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(user_id, document_path);
        CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
        CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(user_id, folder_path);
      `)
    } catch (error) {
      console.warn("Schema migration failed:", error)
      throw error
    }
  } else {
    // Create tables with new schema (if they don't exist)
    database.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        document_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, document_path)
      );

      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        folder_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, folder_path)
      );

      CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
      CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(user_id, document_path);
      CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
      CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(user_id, folder_path);
    `)
  }
  
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
