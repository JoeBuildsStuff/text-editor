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
          sort_order REAL NOT NULL DEFAULT 0,
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
          sort_order REAL NOT NULL DEFAULT 0,
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
    `)
  }

  // Comments tables
  database.exec(`
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
  `)

  // Chat tables
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      context TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      reasoning TEXT,
      context TEXT,
      citations TEXT,
      function_result TEXT,
      seq INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id, seq ASC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_attachments_message_id ON chat_attachments(message_id);
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
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          document_path TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          sort_order REAL NOT NULL DEFAULT 0,
          UNIQUE(user_id, document_path)
        );
        
        INSERT INTO documents_new (id, user_id, title, document_path, created_at, updated_at, sort_order)
        SELECT id, user_id, title, document_path, created_at, updated_at, COALESCE(sort_order, 0) FROM documents;
        
        DROP TABLE documents;
        ALTER TABLE documents_new RENAME TO documents;
        
        CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
        CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(user_id, document_path);
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
