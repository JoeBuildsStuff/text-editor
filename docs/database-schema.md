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

**Custom Database Path**: You can specify a custom path for the documents database using the `DOCUMENTS_SQLITE_PATH` environment variable. The default is `server/documents.db` relative to the project root.

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

## Authentication Database (Admin Tables)

The authentication database (`server/auth.sqlite`) is primarily managed by Better Auth, but also includes two additional tables for admin functionality: `admin_roles` and `admin_actions`. These tables are automatically created when the admin system is first used.

### `admin_roles`

Stores admin privileges for users.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `user_id` | TEXT | PRIMARY KEY | User ID (foreign key to Better Auth `user` table) |
| `is_admin` | INTEGER | NOT NULL, DEFAULT 0 | Whether the user has admin privileges (0 or 1) |
| `created_at` | INTEGER | NOT NULL | Unix timestamp (milliseconds) when the admin role was created |

**Example Row**:
```sql
user_id: "user123"
is_admin: 1
created_at: 1704067200000
```

**Notes**:
- `user_id` references the Better Auth `user` table
- `is_admin` is stored as INTEGER (0 or 1) but used as boolean
- The table uses `ON CONFLICT DO UPDATE` for upserts when setting admin status

### `admin_actions`

Stores audit log entries for all admin actions.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID of the audit log entry |
| `actor_user_id` | TEXT | NOT NULL | User ID of the admin who performed the action |
| `action` | TEXT | NOT NULL | Type of action (e.g., "create_user", "set_admin", "revoke_sessions") |
| `target_user_id` | TEXT | NULL | User ID of the target user (if applicable) |
| `ip` | TEXT | NULL | IP address of the request (when available) |
| `user_agent` | TEXT | NULL | User agent string from request headers |
| `metadata` | TEXT | NULL | JSON-encoded metadata specific to the action |
| `created_at` | INTEGER | NOT NULL | Unix timestamp (milliseconds) when the action occurred |

**Indexes**:
- `idx_admin_actions_actor_created_at` on `(actor_user_id, created_at DESC)` - Fast queries by actor
- `idx_admin_actions_target_created_at` on `(target_user_id, created_at DESC)` - Fast queries by target

**Action Types**:
- `create_user` - Admin created a new user account
- `set_admin` - Admin changed a user's admin status
- `revoke_sessions` - Admin revoked user sessions
- `set_password` - Admin set/reset a user's password
- `delete_user` - Admin deleted a user account

**Example Row**:
```sql
id: "550e8400-e29b-41d4-a716-446655440000"
actor_user_id: "admin123"
action: "set_admin"
target_user_id: "user456"
ip: "192.168.1.1"
user_agent: "Mozilla/5.0..."
metadata: '{"isAdmin": true}'
created_at: 1704067200000
```

**Notes**:
- `metadata` stores action-specific data as JSON (e.g., `{"isAdmin": true}` for set_admin, `{"deleted": 3}` for revoke_sessions)
- IP and user agent are captured from request headers when available
- Actions are ordered newest first in queries
- All admin actions are automatically logged by admin API routes

### Table Initialization

These tables are automatically created by `ensureAdminTables()` when:
- The first admin action is recorded
- Admin user listing is queried
- Admin role is set for a user

The tables are created with `CREATE TABLE IF NOT EXISTS`, so initialization is idempotent and safe to call multiple times.

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

