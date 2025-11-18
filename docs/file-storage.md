# File Storage System

This document describes the file upload and storage system used in the Text Editor application.

## Overview

The application uses a **local-first file storage** approach. All uploaded files (images, documents, attachments) are stored on the server's file system in user-scoped directories. This eliminates the need for external storage services like S3 or Supabase Storage.

## Key Features

- **Local Storage**: Files stored on server file system
- **User Isolation**: Each user's files are stored in separate directories
- **Path-Based Storage**: Files referenced by relative paths, not URLs
- **Editor-Safe Serialization**: File nodes serialize to `file-node://` links inside markdown so they survive round-trips and can be restored on load
- **Automatic Cleanup**: Files deleted when removed from editor and when their markdown documents/folders are deleted
- **Type Validation**: File type and size validation on upload
- **Secure Access**: Authentication required for all file operations

## Storage Layout

### Directory Structure

```
server/uploads/
└── <userId>/
    └── <pathPrefix>/
        └── <filename>-<uuid8>.<ext>
```

**Example**:
```
server/uploads/
└── user123/
    └── notes/
        ├── image-abc12345.jpg
        ├── document-def67890.pdf
        └── archive-xyz11111.zip
```

### Path Components

- **`<userId>`**: Sanitized user ID (first directory segment, ensures user isolation)
- **`<pathPrefix>`**: Optional subdirectory (default: `"notes"`)
- **`<filename>`**: Sanitized original filename
- **`<uuid8>`**: First 8 characters of UUID (prevents collisions)
- **`<ext>`**: File extension (from original file or inferred from MIME type)

### Storage Root

The storage root directory is configurable via environment variable:

```env
FILE_STORAGE_DIR=./server/uploads
```

- **Default**: `server/uploads/` (relative to project root)
- **Absolute paths**: Supported if `FILE_STORAGE_DIR` is absolute
- **Relative paths**: Resolved from project root

## File Upload Flow

### 1. Client-Side Upload

```typescript
// User drops/pastes file in editor
// File Handler Extension intercepts
// Calls file-storage-manager.ts
```

### 2. Upload Request

```http
POST /api/files/upload
Content-Type: multipart/form-data

file: <File>
pathPrefix: "notes" (optional)
```

### 3. Server Processing

1. **Authentication**: Validate user session
2. **Validation**: Check file type and size
3. **Sanitization**: Sanitize filename and path
4. **Storage**: Write file to disk
5. **Response**: Return file path

### 4. Editor Integration

- File path stored in editor content (not base64)
- File nodes serialize to `file-node://` markdown links so custom nodes survive markdown save/load
- User segment is stripped during serialization and re-applied on load so content stays portable but still user-scoped
- Node view components request URLs on render
- Temporary URLs generated via `/api/files/serve`

## API Endpoints

### `POST /api/files/upload`

Upload a file to user storage.

**Request**: Multipart form data
- `file`: File to upload (required)
- `pathPrefix`: Subdirectory (optional, default: `"notes"`)

**Response**:
```json
{
  "path": "user123/notes/filename-uuid8.ext",
  "name": "original-filename.ext",
  "size": 12345,
  "type": "image/png"
}
```

### `GET /api/files/serve`

Get a temporary URL for a file.

**Query Parameters**:
- `path`: Relative file path

**Response**:
```json
{
  "url": "/api/files/raw?path=...&token=...",
  "path": "user123/notes/filename-uuid8.ext",
  "name": "original-filename.ext",
  "size": 12345,
  "type": "image/png"
}
```

### `GET /api/files/raw`

Stream file content.

**Query Parameters**:
- `path`: Relative file path
- `token`: Temporary access token

**Response**: File stream with appropriate `Content-Type`

### `DELETE /api/files/delete`

Delete a file from storage.

**Request Body**:
```json
{
  "path": "user123/notes/filename-uuid8.ext"
}
```

**Response**:
```json
{
  "path": "user123/notes/filename-uuid8.ext",
  "deleted": true
}
```

See [API Reference](./api-reference.md) for complete endpoint documentation.

### Cleanup on Document/Folder Delete

- When a markdown document is deleted, the server scans its content for image paths and `file-node://` links and attempts to delete any referenced uploads.
- Folder deletes perform the same cleanup for every document in the folder tree before removing files and database records.
- Cleanup is best-effort and tolerant of already-missing files (404s are ignored).

## File Validation

### Allowed File Types

Defined in `src/lib/uploads/config.ts`. The complete list of allowed MIME types:

**Images**:
- `image/jpeg`
- `image/png`
- `image/gif`
- `image/webp`

**Documents**:
- `text/plain`
- `application/pdf`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (`.docx`)
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (`.xlsx`)
- `application/vnd.openxmlformats-officedocument.presentationml.presentation` (`.pptx`)
- `application/msword` (`.doc`)
- `application/vnd.ms-excel` (`.xls`)
- `application/vnd.ms-powerpoint` (`.ppt`)

**Archives**:
- `application/zip`
- `application/x-rar-compressed`
- `application/x-7z-compressed`

**Other**:
- `application/json`
- `text/csv`
- `text/html`
- `text/css`

### Size Limits

- **Maximum**: 10 MB (10 * 1024 * 1024 bytes)
- **Configurable**: Via `FILE_UPLOAD_MAX_BYTES` in `src/lib/uploads/config.ts`

### Validation Process

1. **Client-side**: Fast feedback using config values
2. **Server-side**: Authoritative validation (re-validates all checks)

## Security

### Path Sanitization

All file paths are sanitized to prevent:
- Directory traversal attacks (`../`)
- Invalid characters
- Empty segments
- Path manipulation

**Functions**:
- `sanitizeSegment()`: Sanitizes individual path segments
- `sanitizeFilename()`: Sanitizes filenames
- `normalizeStoredPath()`: Normalizes and validates paths

### User Isolation

Files are isolated by user ID:

1. **Path Validation**: First segment must match user ID
2. **Access Control**: `ensureUserScope()` enforces user ownership
3. **Database Queries**: All operations filter by `user_id`

**Example**:
```typescript
// Valid path for user123
"user123/notes/file.jpg" ✅

// Invalid (different user)
"user456/notes/file.jpg" ❌ (403 Forbidden)

// Invalid (no user segment)
"notes/file.jpg" ❌ (403 Forbidden)
```

### Authentication

All file operations require authentication:
- Session validation on every request
- User ID extracted from session
- Path validation against authenticated user

## File Naming

### Naming Convention

Files are renamed on upload:

```
<sanitized-filename>-<uuid8>.<extension>
```

**Example**:
- Original: `My Document.pdf`
- Stored: `My-Document-abc12345.pdf`

### Collision Prevention

- **UUID suffix**: First 8 characters of UUID appended
- **Unique per upload**: Even identical filenames get different UUIDs
- **No overwrites**: Each upload creates a new file

### Extension Handling

1. **From filename**: Use extension from original filename
2. **From MIME type**: Infer extension from MIME type if missing
3. **Fallback**: No extension if neither available

## Editor Integration

### Tiptap Extensions

#### File Handler Extension

`src/components/tiptap/file-handler.tsx`:
- Intercepts file drops and paste events
- Uploads files via `/api/files/upload`
- Inserts file nodes into editor

#### File Storage Manager

`src/components/tiptap/file-storage-manager.ts`:
- Single entry point for file operations
- Provides `uploadFile()`, `deleteFile()`, `getFileUrl()`
- Handles API communication

### Node Views

#### Image Node View

`src/components/tiptap/custom-image-view.tsx`:
- Renders images in editor
- Requests URL from `/api/files/serve` on mount
- Displays image with proper sizing

#### File Node View

`src/components/tiptap/file-node-view.tsx`:
- Renders file attachments in editor
- Shows file icon, name, and size
- Provides download link

#### Document Preview

`src/components/tiptap/file-document-preview.tsx`:
- Preview for document files (PDF, etc.)
- Embedded preview when possible
- Fallback to download link

### Content Storage

Editor content stores **only file paths**, not base64 data:

```json
{
  "type": "image",
  "attrs": {
    "src": "user123/notes/image-abc12345.jpg"
  }
}
```

**Benefits**:
- Small content size
- Fast editor loading
- Easy to migrate storage
- Version-control friendly

### URL Resolution

1. **On Render**: Node view requests URL from `/api/files/serve`
2. **Temporary URL**: Server returns temporary URL with token
3. **Display**: Component uses URL to display file
4. **Expiration**: Token expires after short time

## File Cleanup

### Automatic Cleanup

When a file node is deleted from the editor:
1. `file-cleanup.ts` detects deletion
2. Calls `/api/files/delete` with file path
3. File is removed from storage

### Manual Cleanup

Files can be manually deleted via API:
```http
DELETE /api/files/delete
Content-Type: application/json

{
  "path": "user123/notes/file.jpg"
}
```

### Orphaned Files

Currently, there's no automatic cleanup of orphaned files (files not referenced in any document). Consider implementing:
- Periodic cleanup job
- File reference tracking
- Manual cleanup tools

## Configuration

### Environment Variables

```env
# Custom storage directory (optional)
FILE_STORAGE_DIR=./server/uploads
```

### Code Configuration

`src/lib/uploads/config.ts`:
```typescript
export const DEFAULT_UPLOAD_PATH_PREFIX = "notes"
export const FILE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
export const ALLOWED_UPLOAD_MIME_TYPES = [...]
```

## Migration to External Storage

If you need to migrate to external storage (S3, etc.):

1. **Update `file-storage.ts`**: Replace file system operations with storage SDK
2. **Update API routes**: Modify upload/delete/serve endpoints
3. **Update paths**: Keep path format or migrate to URLs
4. **Migration script**: Copy existing files to new storage

The path-based approach makes migration easier since paths can map to storage keys.

## Performance Considerations

### File Serving

- **Streaming**: Files are streamed, not loaded into memory
- **Caching**: Consider adding cache headers for static files
- **CDN**: Can be fronted by CDN for better performance

### Storage Limits

- **Disk Space**: Limited by server disk capacity
- **Backup**: Regular backups recommended
- **Monitoring**: Monitor disk usage

### Scalability

For high-scale deployments:
- Consider object storage (S3, etc.)
- Use CDN for file serving
- Implement file reference tracking
- Add cleanup jobs for orphaned files

## Troubleshooting

### File Not Found

1. Check file exists in `server/uploads/`
2. Verify path matches stored path
3. Check user ID matches authenticated user
4. Verify file permissions

### Upload Fails

1. Check file type is allowed
2. Verify file size within limits
3. Check disk space available
4. Verify directory permissions

### Access Denied

1. Verify user is authenticated
2. Check path starts with user ID
3. Verify user ID matches session

## Related Documentation

- [API Reference](./api-reference.md) - File API endpoints
- [Architecture Overview](./architecture.md) - System design
- [Development Guide](./development-guide.md) - Setup instructions
- [Tiptap README](../src/components/tiptap/README.md) - Editor integration
