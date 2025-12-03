# Text Editor

A markdown-based text editor built with Next.js and Tiptap. Create, edit, and organize markdown documents with a rich editing experience.

## What It Does

This application provides a full-featured markdown editor where you can:

- **Create and edit markdown documents** using a rich Tiptap editor with markdown support
- **Organize documents in folders** with a hierarchical folder structure
- **Drag and drop** documents and folders to reorder or move them between folders
- **Edit document and folder titles** inline - titles are stored separately from filenames
- **View all documents** in a collapsible sidebar tree with auto-expansion
- **Upload files** - images, documents (PDF, DOCX, etc.), archives, and more - directly into your documents
- **Execute code** - Run Python, JavaScript, TypeScript, and Bash code blocks directly in the editor
- **Terminal interface** - Access a dedicated terminal page for interactive code execution
- **Autosave** - Document content automatically saves as you type (1 second debounce)
- **Delete documents and folders** directly from the editor interface with recursive folder deletion
- **Admin features** - User management, audit logging, and administrative controls (admin users only)

## How It Works

### Document Storage

- **Hybrid approach**: Metadata (IDs, titles, paths, timestamps) is stored in **SQLite database** at `server/documents.db`
- **Content** is stored in **markdown files** in `server/documents/` directory
- **Attachments & images** are written to `server/uploads/<userId>/...` through the `/api/files/*` routes so they can be referenced from the editor content
- Each document has a **UUID-based ID** for stable references, even when filenames change
- Documents and folders can be organized in **nested folders** using folder paths
- The database uses ACID transactions for metadata operations
- Content files are version-control friendly and can be edited with external tools

### Key Components

1. **Tiptap Editor** (`src/components/tiptap/tiptap.tsx`)
   - Rich markdown editor with formatting tools
   - Supports headings, lists, code blocks, tables, links, images, and more
   - Content is stored and edited as markdown

2. **Document Title Editor** (`src/components/documents/document-title-editor.tsx`)
   - Inline title editing component
   - Automatically saves on blur or Enter key
   - Updates both the metadata and filename when title changes

3. **Sidebar** (`src/components/app-sidebar.tsx`)
   - Displays a tree view of all documents organized by folders
   - Auto-expands folders containing the currently selected document
   - **Drag and drop** - Reorder documents/folders or move them between folders
   - Allows creating new documents and folders (including empty folders) via buttons or context menus
   - Right-click any folder or document to open contextual actions (create, rename, delete) with toast feedback
   - Custom sort order support for manual organization

4. **Document Editor** (`src/components/documents/document-editor.tsx`)
   - Wraps the Tiptap editor with autosave functionality
   - Automatically saves content changes after 1 second of inactivity
   - Shows save status (Saving…, Saved, or error messages)
   - Saves pending changes on component unmount

5. **Terminal** (`src/app/(app)/terminal/page.tsx`)
   - Dedicated terminal interface for interactive code execution
   - Supports Python, JavaScript, TypeScript, and Bash modes
   - Command history with persistent output
   - Streams execution output in real-time

6. **File Upload System** (`src/components/tiptap/file-handler.tsx`, `src/components/tiptap/file-node.tsx`)
   - Unified file handling for images, documents, archives, and other file types
   - Drag-and-drop or paste files directly into the editor
   - Automatic file type detection and appropriate preview rendering
   - Secure file storage with user-scoped paths

7. **Markdown API** (`src/app/api/markdown/route.ts`)
   - `GET` - List all documents (without content by default)
   - `POST` - Create a new document or folder
   - `PATCH` - Multiple operations: rename document/folder, move document/folder, update content, reorder items
   - `DELETE` - Delete a document or folder

### Document Management

- **Database storage**: All documents and folders are stored in SQLite with atomic operations, ensuring data consistency
- **Title vs Filename**: Document titles (display names) are stored separately from document paths, allowing user-friendly titles while maintaining valid paths
- **Slug-based routing**: Documents are accessed via `/documents/[id]` where `id` is the document's UUID slug
- **Folder creation**: Folders are stored as first-class database entries. You can create empty folders from the UI or API, and add documents to them later.
- **Folder operations**: Folders can be renamed, moved between parent folders, and deleted. Deleting a folder recursively removes all nested folders and documents from the database automatically.
- **Drag and drop**: Documents and folders can be reordered within the same parent or moved to different folders via drag-and-drop in the sidebar
- **Sort order**: Custom sort order is maintained for documents and folders, allowing manual organization
- **Autosave**: Document content automatically saves after 1 second of inactivity, with visual feedback for save status

## Development Setup

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Create your env file** – copy `.env.example` to `.env.local` (or `.env`) and set at least:
   - `BETTER_AUTH_SECRET`: generate one with `pnpm auth:secret` or `openssl rand -hex 32`
   - `BETTER_AUTH_URL` / `NEXT_PUBLIC_BETTER_AUTH_URL`: usually `http://localhost:3000`

3. **Create the local SQLite databases** – this repo does not commit `documents.db` or `auth.sqlite`, so run:

   ```bash
   pnpm db:init
   ```

   This command does two things:
   - `pnpm db:setup` – runs `scripts/setup-databases.ts` which creates `server/documents.db`, applies the schema from `sql/documents-schema.sql`, seeds demo data when the tables are empty, and drops a sample markdown file under `server/documents/`.
   - `pnpm auth:migrate` – runs the Better Auth CLI against `src/lib/auth.ts` to create the required tables inside `server/auth.sqlite`.

   Run those scripts individually if you only need to refresh one database.

4. **Start the dev server** (next section) and sign up/in with email + password. The seeded markdown document lives under the demo folder in the sidebar.

## Getting Started

After completing the steps above, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## API Reference

### POST `/api/markdown`

Create a new markdown document or folder.

**Document request**

```json
{
  "type": "document",
  "title": "My Document",
  "content": "# Heading\nYour markdown body",
  "folderPath": "optional/folder/path",
  "overwrite": false
}
```

- `type` (optional) - Defaults to `"document"`. Set explicitly for clarity.
- `title` (required when `type` is `"document"`) - Display title for the document
- `content` (optional) - Markdown content, defaults to empty string
- `folderPath` (optional) - Folder path where the document should be created
- `overwrite` (optional) - If true, overwrites an existing file with the same name

**Folder request**

```json
{
  "type": "folder",
  "folderPath": "parent/new-folder"
}
```

- `type` must be `"folder"`
- `folderPath` (required) - Path for the folder. Each segment is sanitized; the final segment is used as the new folder's name. A numeric suffix is appended automatically if the folder already exists.

### GET `/api/markdown`

List all documents and folders. Returns an object with:

- `documents` - Array of document metadata (without content by default)
- `folders` - Array of folder metadata (`id`, `folderPath`, timestamps)

### PATCH `/api/markdown`

Update documents and folders. The API automatically detects the operation type based on the request body.

**Rename Document**

```json
{
  "id": "uuid-of-document",
  "title": "New Title"
}
```

**Rename Folder**

```json
{
  "type": "folder",
  "folderPath": "path/to/folder",
  "newName": "New Folder Name"
}
```

**Move Document**

```json
{
  "id": "uuid-of-document",
  "targetFolderPath": "target/folder/path"
}
```

- `targetFolderPath` can be `null` to move to root
- Optional `sortOrder` can be included for positioning

**Move Folder**

```json
{
  "type": "folder",
  "folderPath": "path/to/folder",
  "targetFolderPath": "target/parent/path"
}
```

**Update Document Content**

```json
{
  "id": "uuid-of-document",
  "content": "# Updated content\n\nNew markdown content here"
}
```

**Reorder Item**

```json
{
  "id": "uuid-of-item",
  "type": "document",
  "sortOrder": 1.5
}
```

- `type` must be `"document"` or `"folder"`
- `sortOrder` is a number used for custom ordering

### DELETE `/api/markdown`

Delete a document or folder.

**Document request**

```json
{
  "id": "uuid-of-document"
}
```

- `id` (required) – UUID of the document to delete

**Folder request**

```json
{
  "type": "folder",
  "folderPath": "path/to/folder"
}
```

- `type` must be `"folder"`
- `folderPath` (required) – Relative folder path (using `/` separators). The folder and all nested contents are deleted recursively.

## Database & File Storage

The application uses a **hybrid storage approach**:

### SQLite Database (`server/documents.db`)
Stores metadata only:
- **documents table**: Document ID, title, path, and timestamps
- **folders table**: Folder ID, path, and timestamps
- **Indexes**: Optimized indexes on document and folder paths for fast queries

### File System (`server/documents/`)
Stores document content:
- Markdown files (`.md`) organized by folder structure
- Content is stored in files matching the `document_path` from the database
- Files can be edited with external tools and are version-control friendly

### Uploads & Previews (Local-first)
- All images and attachments are uploaded via `/api/files/*` and written under `server/uploads/{userId}/{pathPrefix}/...` (default `pathPrefix` is `notes`).
- Editor content stores only the relative path (e.g., `{userId}/notes/base-uuid8.ext`). Components request a scoped internal URL from `/api/files/serve` which returns `/api/files/raw?path=...`.
- Client-side limits (size/type) come from `src/lib/uploads/config.ts` for fast feedback; the server re-validates and is authoritative. File names are normalized and saved as `${baseName}-${uuid8}${ext}`.
- Paths are normalized and restricted to the authenticated user by `src/lib/file-storage.ts`. Override the root with `FILE_STORAGE_DIR` when needed.

**Supported File Types**:
- **Images**: JPEG, PNG, GIF, WebP
- **Documents**: PDF, DOCX, XLSX, PPTX, DOC, XLS, PPT, TXT
- **Archives**: ZIP, RAR, 7Z
- **Other**: JSON, CSV, HTML, CSS

**File Size Limit**: 10 MB per file (configurable via `FILE_UPLOAD_MAX_BYTES`)

- See `docs/file-storage.md` and `docs/README.md` for the full flow, API routes, and extension/component integration details.

## Code Execution

Code blocks in the editor can execute code in multiple languages. When code execution is enabled (via `enableCodeExecution` prop on the Tiptap component), code blocks display a "Run" button.

### Supported Languages

- **Python** (`python`, `py`) - Executes Python 3 code
- **JavaScript** (`javascript`, `js`, `jsx`, `node`) - Executes Node.js code
- **TypeScript** (`typescript`, `ts`, `tsx`) - Executes TypeScript code (requires `tsx` binary)
- **Bash** (`bash`, `shell`, `sh`, `zsh`) - Executes shell commands (requires sandbox mode)
- **HTML/CSS** (`html`, `htm`, `xml`, `svg`, `css`) - Renders preview instead of executing

### Execution Modes

**Sandbox Mode** (when `ENABLE_PYTHON_SANDBOX=true`):
- Code runs in a hardened Docker container with:
  - **No network access** (`--network none`) – prevents `pip install` and external connections (unless `ALLOW_SANDBOX_NETWORK=true`)
  - **Read-only filesystem** – prevents file system attacks
  - **Resource limits** – CPU (0.5 cores), memory (256MB), and process limits (50 PIDs)
  - **Non-root user** – runs as `nobody:nogroup` for security
  - **Persistent storage** – User-specific sandbox directories persist across executions
- Required for Bash execution
- TypeScript execution is not available in sandbox mode

**Local Mode** (when `ENABLE_PYTHON_SANDBOX=false`):
- Code runs directly on the server
- Network access allowed (useful for development)
- ⚠️ **Warning**: This runs code directly on your machine without isolation. Use only in development.

### Installing Python Packages

Since the sandbox has no network access by default, you cannot run `pip install` at runtime. To use packages like `openai`, create a custom Docker image:

1. **Build a custom image** with packages pre-installed:
   ```bash
   docker build -f Dockerfile.python-sandbox -t python-sandbox:custom .
   ```

2. **Update your environment** to use the custom image:
   ```bash
   PYTHON_DOCKER_IMAGE=python-sandbox:custom
   ```

3. **Enable network access** (optional, for development):
   ```bash
   ALLOW_SANDBOX_NETWORK=true
   ```

### Terminal Interface

The application includes a dedicated terminal page at `/terminal` for interactive code execution:
- Switch between execution modes (Python, JavaScript, TypeScript, Bash)
- Command history with persistent output
- Real-time streaming of stdout and stderr
- Clear history with `clear` command

See `docs/python-sandbox-setup.md` for detailed configuration.

## Admin Features

The application includes a comprehensive admin system accessible at `/admin` (admin users only):

### Admin Dashboard
- Centralized interface for user management and audit logs
- Quick access to user statistics and recent admin actions

### User Management (`/admin/users`)
- **List Users**: View all users with email, name, admin status, active session count, and creation date
- **Create Users**: Create new user accounts with email, password, optional name, and optional admin status
- **Toggle Admin Status**: Promote or demote users to/from admin role
- **Revoke Sessions**: Log out all sessions for a specific user (force logout)
- **Set Passwords**: Reset user passwords (useful for password resets or account recovery)
- **Delete Users**: Permanently delete user accounts with cascade cleanup:
  - Removes user from authentication database
  - Deletes all user sessions
  - Deletes user's documents and folders from database
  - Removes user's markdown files from `server/documents/<userId>/`
  - Removes user's uploads from `server/uploads/<userId>/`
  - Removes admin role entry if present

### Audit Log (`/admin/audit`)
- Complete history of all admin actions
- Tracks actor, target user, action type, IP address, user agent, and metadata
- Pagination support (default 50, max 200 entries per page)

See `docs/authentication.md` for more details on admin features and access control.

## Upcoming Enhancements

- **Stable sidebar tree data** – eliminate the document tree flicker in `AppSidebar` by caching `/api/markdown` responses (React context/SWR/server component) instead of refetching on every navigation.
