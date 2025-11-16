# Database Schema

This document describes the database structure used in the Text Editor application.

## Overview

The application uses two SQLite databases:

1. **`server/documents.db`** - Document and folder metadata
2. **`server/auth.sqlite`** - Authentication data (managed by Better Auth)

This document focuses on `documents.db`. For authentication schema, see [Authentication Documentation](./authentication.md).

## Documents Database

### Schema File

The canonical schema is defined in `sql/documents-schema.sql`. This file is used to create new database instances.

### Tables

#### `documents`

Stores metadata for markdown documents.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID of the document |
| `user_id` | TEXT | NOT NULL | ID of the user who owns the document |
| `title` | TEXT | NOT NULL | Display title of the document |
| `document_path` | TEXT | NOT NULL | Relative path to the markdown file |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp of creation |
| `updated_at` | TEXT | NOT NULL | ISO 8601 timestamp of last update |

**Unique Constraint**: `(user_id, document_path)` - Ensures no duplicate paths per user

**Indexes**:
- `idx_documents_user_id` on `user_id` - Fast user document queries
- `idx_documents_path` on `(user_id, document_path)` - Fast path lookups

**Example Row**:
```sql
id: "550e8400-e29b-41d4-a716-446655440000"
user_id: "user123"
title: "My Document"
document_path: "my-document.md"
created_at: "2024-01-01T00:00:00.000Z"
updated_at: "2024-01-01T00:00:00.000Z"
```

#### `folders`

Stores metadata for folders (organizational structure).

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID of the folder |
| `user_id` | TEXT | NOT NULL | ID of the user who owns the folder |
| `folder_path` | TEXT | NOT NULL | Relative path of the folder |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp of creation |
| `updated_at` | TEXT | NOT NULL | ISO 8601 timestamp of last update |

**Unique Constraint**: `(user_id, folder_path)` - Ensures no duplicate paths per user

**Indexes**:
- `idx_folders_user_id` on `user_id` - Fast user folder queries
- `idx_folders_path` on `(user_id, folder_path)` - Fast path lookups

**Example Row**:
```sql
id: "660e8400-e29b-41d4-a716-446655440001"
user_id: "user123"
folder_path: "my-folder/subfolder"
created_at: "2024-01-01T00:00:00.000Z"
updated_at: "2024-01-01T00:00:00.000Z"
```

### Database Configuration

The schema includes SQLite pragmas for optimal performance:

```sql
PRAGMA journal_mode = WAL;  -- Write-Ahead Logging for better concurrency
PRAGMA foreign_keys = ON;    -- Enable foreign key constraints
```

### Relationships

- **Documents → Users**: Many-to-one (via `user_id`)
- **Folders → Users**: Many-to-one (via `user_id`)
- **Documents ↔ Folders**: Logical relationship via `document_path` and `folder_path` (not enforced by foreign keys)

### Path Structure

Paths are stored as relative strings:

- **Documents**: `"document.md"` or `"folder/subfolder/document.md"`
- **Folders**: `"folder"` or `"parent/child"`

Paths use forward slashes (`/`) as separators and are normalized to prevent:
- Leading/trailing slashes
- Empty segments
- Invalid characters

## File System Integration

### Document Content

Document content is stored separately in the file system:

- **Location**: `server/documents/`
- **Format**: Markdown files (`.md`)
- **Naming**: Matches `document_path` from database
- **Structure**: Organized by folder paths

**Example**:
```
Database: document_path = "my-folder/document.md"
File System: server/documents/my-folder/document.md
```

### User Isolation

Documents and folders are isolated by `user_id`:
- Database queries filter by `user_id`
- File system can be organized by user (optional)
- No cross-user data access

## Common Queries

### List All Documents for User

```sql
SELECT * FROM documents
WHERE user_id = ?
ORDER BY updated_at DESC;
```

### Find Document by ID

```sql
SELECT * FROM documents
WHERE id = ? AND user_id = ?;
```

### List Documents in Folder

```sql
SELECT * FROM documents
WHERE user_id = ? 
  AND document_path LIKE ? || '/%'
ORDER BY document_path;
```

### List All Folders for User

```sql
SELECT * FROM folders
WHERE user_id = ?
ORDER BY folder_path;
```

### Find Folder by Path

```sql
SELECT * FROM folders
WHERE user_id = ? AND folder_path = ?;
```

## Migrations

### Creating Migrations

When modifying the schema:

1. **Create migration file**:
   ```bash
   touch sql/migrations/YYYYMMDD_description.sql
   ```

2. **Write migration**:
   ```sql
   BEGIN TRANSACTION;

   -- Your changes here
   ALTER TABLE documents ADD COLUMN new_field TEXT;

   COMMIT;
   ```

3. **Update canonical schema**:
   - Update `sql/documents-schema.sql` to match

4. **Test migration**:
   ```bash
   sqlite3 server/documents.db < sql/migrations/YYYYMMDD_description.sql
   ```

### Migration Best Practices

- **Use transactions**: Wrap changes in `BEGIN TRANSACTION` / `COMMIT`
- **Idempotent**: Migrations should be safe to run multiple times
- **Backward compatible**: When possible, make additive changes only
- **Test locally**: Always test migrations before committing
- **Document changes**: Include comments explaining the change

See `server/README.md` for detailed migration guidelines.

## Seed Data

### Seed File

Seed data is defined in `sql/documents-seed.sql`. This file is only applied when the database is empty (new installations).

### Seed Content

The seed file typically includes:
- A demo folder
- A sample document
- Example content to help users get started

**Note**: Seed data is user-agnostic. In a multi-user system, you may want to create seed data per user on first login.

## Database Initialization

### Setup Script

The `scripts/setup-databases.ts` script:

1. Creates `server/documents.db` if it doesn't exist
2. Applies schema from `sql/documents-schema.sql`
3. Seeds data from `sql/documents-seed.sql` (if database is empty)

### Commands

```bash
# Initialize documents database
pnpm db:setup

# Initialize all databases (documents + auth)
pnpm db:init
```

## Performance Considerations

### Indexes

Indexes are created on frequently queried columns:
- `user_id` - Used in almost every query
- `(user_id, document_path)` - Used for path lookups
- `(user_id, folder_path)` - Used for folder lookups

### WAL Mode

Write-Ahead Logging (WAL) mode is enabled for:
- Better concurrency (multiple readers, one writer)
- Improved performance
- Reduced lock contention

### Query Optimization

- Always filter by `user_id` first (uses index)
- Use parameterized queries (prevents SQL injection)
- Limit result sets when possible
- Use transactions for multiple operations

## Backup and Recovery

### Backup

```bash
# Backup database
cp server/documents.db server/documents.db.bak

# Backup with timestamp
cp server/documents.db server/documents.db.$(date +%Y%m%d).bak
```

### Recovery

```bash
# Restore from backup
cp server/documents.db.bak server/documents.db
```

**Note**: Also backup `server/documents/` directory (markdown files) and `server/uploads/` (user uploads).

## Troubleshooting

### Database Locked

If you see "database is locked" errors:

1. Check for other processes using the database
2. Ensure WAL mode is enabled
3. Restart the application
4. Check for long-running transactions

### Schema Mismatch

If schema doesn't match code:

1. Check `sql/documents-schema.sql` matches current schema
2. Run `pnpm db:setup` to recreate database
3. Apply any pending migrations

### Data Corruption

If database is corrupted:

1. Restore from backup
2. If no backup, try SQLite recovery tools
3. Recreate database and restore data manually

## Related Documentation

- [Server README](../server/README.md) - Migration best practices
- [Development Guide](./development-guide.md) - Setup instructions
- [Architecture Overview](./architecture.md) - System design
- [Authentication](./authentication.md) - Auth database schema

