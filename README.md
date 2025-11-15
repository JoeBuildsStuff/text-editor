# Text Editor

A markdown-based text editor built with Next.js and Tiptap. Create, edit, and organize markdown documents with a rich editing experience.

## What It Does

This application provides a full-featured markdown editor where you can:

- **Create and edit markdown documents** using a rich Tiptap editor with markdown support
- **Organize documents in folders** with a hierarchical folder structure
- **Edit document titles** inline - titles are stored separately from filenames
- **View all documents** in a collapsible sidebar tree
- **Delete documents** directly from the editor interface

## How It Works

### Document Storage

- **Hybrid approach**: Metadata (IDs, titles, paths, timestamps) is stored in **SQLite database** at `server/documents.db`
- **Content** is stored in **markdown files** in `server/documents/` directory
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
   - Allows creating new documents and folders (including empty folders) via buttons or context menus
   - Right-click any folder or document to open contextual actions (create, delete) with toast feedback

4. **Markdown API** (`src/app/api/markdown/route.ts`)
   - `GET` - List all documents (without content by default)
   - `POST` - Create a new document or folder
   - `PATCH` - Rename a document (updates title and filename)
   - `DELETE` - Delete a document or folder

### Document Management

- **Database storage**: All documents and folders are stored in SQLite with atomic operations, ensuring data consistency
- **Title vs Filename**: Document titles (display names) are stored separately from document paths, allowing user-friendly titles while maintaining valid paths
- **Slug-based routing**: Documents are accessed via `/documents/[id]` where `id` is the document's UUID slug
- **Folder creation**: Folders are stored as first-class database entries. You can create empty folders from the UI or API, and add documents to them later.
- **Folder deletion**: Folders can be deleted from the UI or API. Deleting a folder recursively removes all nested folders and documents from the database automatically.

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

Rename a document.

Request body:

```json
{
  "id": "uuid-of-document",
  "title": "New Title"
}
```

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

## Upcoming Enhancements

- **Stable sidebar tree data** – eliminate the document tree flicker in `AppSidebar` by caching `/api/markdown` responses (React context/SWR/server component) instead of refetching on every navigation.
- **Editor save integration** – wire the Tiptap editor to autosave document content back through the markdown API while preserving the UUID-based metadata.
