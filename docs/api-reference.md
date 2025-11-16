# API Reference

Complete documentation for all API endpoints in the Text Editor application.

## Base URL

All API endpoints are prefixed with `/api`:

- **Development**: `http://localhost:3000/api`
- **Production**: `https://your-domain.com/api`

## Authentication

All API endpoints require authentication except for Better Auth routes. Include the session cookie in requests (handled automatically by browsers) or provide an `Authorization` header

### Session Validation

All routes use `getSessionFromHeaders()` to validate the session. Unauthenticated requests return:

```json
{
  "error": "Unauthorized"
}
```

Status: `401 Unauthorized`

## Endpoints

### Document Management

#### `GET /api/markdown`

List all documents and folders for the authenticated user.

**Request**:
```http
GET /api/markdown
```

**Response**:
```json
{
  "documents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "user123",
      "title": "My Document",
      "document_path": "my-document.md",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "folders": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "user_id": "user123",
      "folder_path": "my-folder",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Status Codes**:
- `200 OK` - Success
- `401 Unauthorized` - Not authenticated
- `500 Internal Server Error` - Server error

**Notes**:
- Documents are returned without content by default
- Results are filtered by authenticated user
- Folders are returned as separate array

---

#### `POST /api/markdown`

Create a new document or folder.

**Request Body** (Document):
```json
{
  "type": "document",
  "title": "My New Document",
  "content": "# Heading\n\nDocument content here",
  "folderPath": "optional/folder/path",
  "overwrite": false
}
```

**Request Body** (Folder):
```json
{
  "type": "folder",
  "folderPath": "parent/new-folder"
}
```

**Parameters**:
- `type` (optional, default: `"document"`) - Either `"document"` or `"folder"`
- `title` (required for documents) - Display title (1-128 characters)
- `filename` (optional) - Alternative to title for filename generation
- `content` (optional, default: `""`) - Markdown content for documents
- `folderPath` (optional) - Folder path where item should be created
- `overwrite` (optional, default: `false`) - If true, overwrites existing file with same name

**Response** (Document):
```json
{
  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user123",
    "title": "My New Document",
    "document_path": "my-new-document.md",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Response** (Folder):
```json
{
  "folder": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "user_id": "user123",
    "folder_path": "parent/new-folder",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Status Codes**:
- `201 Created` - Document/folder created
- `200 OK` - Document updated (when `overwrite: true`)
- `400 Bad Request` - Invalid payload
- `401 Unauthorized` - Not authenticated
- `409 Conflict` - File already exists (when `overwrite: false`)
- `500 Internal Server Error` - Server error

**Validation**:
- Title must be 1-128 characters
- Folder path required for folder type
- Title or filename required for document type

---

#### `PATCH /api/markdown`

Update a document or folder. Supports renaming documents, renaming folders, and updating document content.

**Request Body** (Rename Document):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "New Title"
}
```

**Request Body** (Rename Folder):
```json
{
  "type": "folder",
  "folderPath": "old/path",
  "newName": "new-folder-name"
}
```

**Request Body** (Update Content):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "content": "# Updated Content\n\nNew markdown content"
}
```

**Parameters**:
- `id` (required for document operations) - Document UUID
- `title` (required for document rename) - New title (1-128 characters)
- `type` (required for folder rename) - Must be `"folder"`
- `folderPath` (required for folder rename) - Current folder path
- `newName` (required for folder rename) - New folder name (1-128 characters)
- `content` (required for content update) - New markdown content

**Response** (Document):
```json
{
  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user123",
    "title": "New Title",
    "document_path": "new-title.md",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T12:00:00.000Z"
  }
}
```

**Response** (Folder):
```json
{
  "folder": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "user_id": "user123",
    "folder_path": "old/new-folder-name",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T12:00:00.000Z"
  }
}
```

**Status Codes**:
- `200 OK` - Update successful
- `400 Bad Request` - Invalid payload
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Document/folder not found
- `500 Internal Server Error` - Server error

**Notes**:
- Document rename updates both title and filename
- Content update only updates the markdown file, not metadata
- Folder rename updates the folder path

---

#### `DELETE /api/markdown`

Delete a document or folder.

**Request Body** (Document):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Request Body** (Folder):
```json
{
  "type": "folder",
  "folderPath": "path/to/folder"
}
```

**Parameters**:
- `id` (required for documents) - Document UUID
- `type` (required for folders) - Must be `"folder"`
- `folderPath` (required for folders) - Folder path to delete

**Response** (Document):
```json
{
  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user123",
    "title": "Deleted Document",
    "document_path": "deleted-document.md",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Response** (Folder):
```json
{
  "folderPath": "path/to/folder"
}
```

**Status Codes**:
- `200 OK` - Deletion successful
- `400 Bad Request` - Invalid payload
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Document/folder not found
- `500 Internal Server Error` - Server error

**Notes**:
- Deleting a folder recursively deletes all nested folders and documents
- Both database records and files are removed
- Operation is atomic (all or nothing)

---

### File Management

#### `POST /api/files/upload`

Upload a file (image, document, etc.) to user storage.

**Request**:
```http
POST /api/files/upload
Content-Type: multipart/form-data
```

**Form Data**:
- `file` (required) - File to upload
- `pathPrefix` (optional, default: `"notes"`) - Subdirectory within user's upload folder

**Response**:
```json
{
  "path": "user123/notes/filename-uuid8.ext",
  "name": "original-filename.ext",
  "size": 12345,
  "type": "image/png"
}
```

**Status Codes**:
- `200 OK` - Upload successful
- `400 Bad Request` - Invalid file (type, size, etc.)
- `401 Unauthorized` - Not authenticated
- `413 Payload Too Large` - File too large
- `500 Internal Server Error` - Server error

**Validation**:
- File type must be allowed (see `src/lib/uploads/config.ts`)
- File size must be within limits
- File is saved to `server/uploads/<userId>/<pathPrefix>/`

**Notes**:
- Files are renamed with UUID suffix to prevent collisions
- Original filename is preserved in response
- Path is relative to upload root

---

#### `GET /api/files/serve`

Get a temporary URL and metadata for a file.

**Request**:
```http
GET /api/files/serve?path=user123/notes/filename-uuid8.ext
```

**Query Parameters**:
- `path` (required) - Relative file path from upload root

**Response**:
```json
{
  "url": "/api/files/raw?path=user123/notes/filename-uuid8.ext&token=...",
  "path": "user123/notes/filename-uuid8.ext",
  "name": "original-filename.ext",
  "size": 12345,
  "type": "image/png"
}
```

**Status Codes**:
- `200 OK` - Success
- `400 Bad Request` - Invalid path
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - File belongs to different user
- `404 Not Found` - File doesn't exist
- `500 Internal Server Error` - Server error

**Notes**:
- URL includes a temporary token for access
- Token expires after a short time
- Path is validated to ensure user ownership

---

#### `GET /api/files/raw`

Stream file content directly.

**Request**:
```http
GET /api/files/raw?path=user123/notes/filename-uuid8.ext&token=...
```

**Query Parameters**:
- `path` (required) - Relative file path
- `token` (required) - Temporary access token from `/api/files/serve`

**Response**:
- File content with appropriate `Content-Type` header
- Binary stream

**Status Codes**:
- `200 OK` - Success
- `400 Bad Request` - Invalid path or token
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Invalid token or user mismatch
- `404 Not Found` - File doesn't exist
- `500 Internal Server Error` - Server error

**Notes**:
- Token must be valid and not expired
- File is streamed, not loaded into memory
- Appropriate `Content-Type` header is set

---

#### `DELETE /api/files/delete`

Delete a file from storage.

**Request Body**:
```json
{
  "path": "user123/notes/filename-uuid8.ext"
}
```

**Parameters**:
- `path` (required) - Relative file path to delete

**Response**:
```json
{
  "path": "user123/notes/filename-uuid8.ext",
  "deleted": true
}
```

**Status Codes**:
- `200 OK` - Deletion successful
- `400 Bad Request` - Invalid path
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - File belongs to different user
- `404 Not Found` - File doesn't exist
- `500 Internal Server Error` - Server error

**Notes**:
- Path is validated to ensure user ownership
- File is permanently deleted from disk
- No recovery possible after deletion

---

### Authentication

#### `POST /api/auth/sign-up`

Register a new user account.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "secure-password"
}
```

**Response**:
```json
{
  "user": {
    "id": "user123",
    "email": "user@example.com"
  },
  "session": {
    "id": "session123",
    "expiresAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**Status Codes**:
- `201 Created` - Account created
- `400 Bad Request` - Invalid email or password
- `409 Conflict` - Email already exists
- `500 Internal Server Error` - Server error

---

#### `POST /api/auth/sign-in`

Sign in with email and password.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "secure-password"
}
```

**Response**:
```json
{
  "user": {
    "id": "user123",
    "email": "user@example.com"
  },
  "session": {
    "id": "session123",
    "expiresAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**Status Codes**:
- `200 OK` - Sign in successful
- `400 Bad Request` - Invalid email or password
- `401 Unauthorized` - Invalid credentials
- `500 Internal Server Error` - Server error

---

#### `POST /api/auth/sign-out`

Sign out the current user.

**Request**: No body required

**Response**:
```json
{
  "success": true
}
```

**Status Codes**:
- `200 OK` - Sign out successful
- `401 Unauthorized` - Not authenticated

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common error messages:
- `"Unauthorized"` - Authentication required
- `"Invalid payload"` - Request validation failed
- `"Document not found"` - Document doesn't exist
- `"File too large"` - File exceeds size limit
- `"Invalid file type"` - File type not allowed

## Rate Limiting

Currently, there is no rate limiting implemented. Consider adding rate limiting for production deployments.

## Related Documentation

- [File Storage System](./file-storage.md) - File upload architecture
- [Authentication](./authentication.md) - Auth system details
- [Development Guide](./development-guide.md) - Development setup

