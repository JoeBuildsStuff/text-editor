# CLAUDE.MD - AI Assistant Context

This file provides context for AI assistants working on this codebase.

## Project Overview

A markdown-based text editor built with Next.js 16, Tiptap, and Better Auth. The application provides a rich editing experience for creating and organizing markdown documents with a hierarchical folder structure.

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Editor**: Tiptap 3.10 with markdown support
- **UI Components**: Radix UI, Tailwind CSS 4, shadcn/ui patterns
- **Authentication**: Better Auth with SQLite backend
- **Database**: SQLite (better-sqlite3) for metadata
- **File Storage**: Hybrid approach - metadata in SQLite, content in `.md` files
- **Drag & Drop**: @dnd-kit for sidebar tree interactions
- **Forms**: React Hook Form with Zod validation
- **State Management**: React Query (@tanstack/react-query)

## Architecture

### Hybrid Storage Model

The application uses a split storage approach for optimal performance and version control:

1. **SQLite Database** (`server/documents.db`)
   - Stores document/folder metadata (IDs, titles, paths, timestamps)
   - Provides ACID transactions for atomic operations
   - Schema defined in `sql/documents-schema.sql`

2. **File System** (`server/documents/`)
   - Stores actual markdown content as `.md` files
   - Files are version-control friendly
   - Can be edited with external tools

3. **Uploads** (`server/uploads/{userId}/`)
   - Images and attachments uploaded via `/api/files/*`
   - Paths normalized and restricted to authenticated user
   - File names: `${baseName}-${uuid8}${ext}`

### Key Design Patterns

- **UUID-based document IDs**: Stable references even when filenames/titles change
- **Slug-based routing**: `/documents/[id]` where `id` is the document UUID
- **Title vs Path separation**: Display names stored separately from filesystem paths
- **First-class folders**: Empty folders can exist independently of documents
- **Recursive deletion**: Deleting a folder removes all nested contents

## Directory Structure

```
src/
├── app/
│   ├── (app)/              # Authenticated app routes
│   │   ├── admin/          # Admin dashboard (users, audit logs)
│   │   ├── documents/      # Document editor views
│   │   └── profile/        # User profile settings
│   ├── (auth)/             # Authentication routes (sign-in, sign-up)
│   └── api/
│       ├── auth/           # Better Auth endpoints
│       ├── markdown/       # Document/folder CRUD operations
│       ├── files/          # File upload, serve, delete
│       └── admin/          # Admin API routes
│
├── components/
│   ├── sidebar/            # File tree, drag-and-drop, folder management
│   │   ├── tree/           # Tree rendering logic, DnD utilities
│   │   ├── hooks/          # useMarkdownExplorer hook
│   │   └── api/            # markdown-actions.ts (API client)
│   ├── tiptap/             # Tiptap editor, extensions, file handling
│   ├── documents/          # Document title editor, empty states
│   ├── auth/               # Sign-in/sign-up forms, user menu
│   └── ui/                 # Reusable UI components (shadcn/ui style)
│
├── lib/
│   ├── auth.ts             # Better Auth configuration
│   ├── file-storage.ts     # File storage utilities
│   └── uploads/            # Upload configuration and validation
│
server/
├── documents.db            # SQLite database (not committed)
├── auth.sqlite             # Better Auth database (not committed)
├── documents/              # Markdown content files
└── uploads/                # User-uploaded files

sql/
└── documents-schema.sql    # Database schema definition

scripts/
└── setup-databases.ts      # Database initialization script
```

## Critical Files & Components

### API Routes

1. **`src/app/api/markdown/route.ts`** - Core document/folder API
   - `GET` - List all documents and folders
   - `POST` - Create document or folder
   - `PATCH` - Rename document
   - `DELETE` - Delete document or folder (recursive)

2. **`src/app/api/files/*`** - File upload/serving
   - `upload/` - Upload images/attachments
   - `serve/` - Get scoped internal URL
   - `raw/` - Serve raw file content
   - `delete/` - Delete uploaded files

### Components

1. **`src/components/sidebar/app-sidebar.tsx`** - Main sidebar
   - File tree with drag-and-drop
   - Context menus for create/delete operations
   - Auto-expands to show current document

2. **`src/components/tiptap/tiptap.tsx`** - Tiptap editor
   - Rich markdown editing
   - Custom extensions for images, tables, code blocks
   - File handling (drag-and-drop, paste)

3. **`src/components/documents/document-title-editor.tsx`** - Title editor
   - Inline editing with auto-save
   - Updates both metadata and filename

4. **`src/components/sidebar/tree/sidebar-tree.tsx`** - Tree rendering
   - Uses @headless-tree for tree structure
   - Drag-and-drop with @dnd-kit
   - Drop position indicators

### Utilities

- **`src/components/sidebar/tree/tree-utils.ts`** - Tree data transformation
- **`src/components/sidebar/tree/dnd-utils.ts`** - Drag-and-drop logic
- **`src/lib/file-storage.ts`** - File system operations
- **`src/lib/uploads/config.ts`** - Upload limits and validation

## Development Workflow

### Initial Setup

```bash
# Install dependencies
pnpm install

# Create environment file
cp .env.example .env.local

# Generate auth secret
pnpm auth:secret

# Initialize databases (creates documents.db and auth.sqlite)
pnpm db:init

# Start dev server
pnpm dev
```

### Database Commands

- `pnpm db:setup` - Create/seed documents.db
- `pnpm auth:migrate` - Create Better Auth tables
- `pnpm db:init` - Run both setup commands

### Environment Variables

Required variables (see `.env.example`):
- `BETTER_AUTH_SECRET` - Auth session secret
- `BETTER_AUTH_URL` - Auth server URL
- `NEXT_PUBLIC_BETTER_AUTH_URL` - Client-side auth URL

Optional:
- `FILE_STORAGE_DIR` - Override default upload directory

## Common Tasks for AI Assistants

### When Modifying Document Structure

1. Update SQLite schema in `sql/documents-schema.sql`
2. Modify API routes in `src/app/api/markdown/route.ts`
3. Update TypeScript types (check `src/components/sidebar/tree/tree-types.ts`)
4. Update database setup in `scripts/setup-databases.ts`

### When Adding Tiptap Extensions

1. Import and configure in `src/components/tiptap/tiptap.tsx`
2. Add toolbar buttons if needed in `src/components/tiptap/fixed-menu.tsx`
3. Update markdown serialization if required
4. Consider bubble menu integration

### When Modifying Sidebar/Tree

1. Tree state management is in `src/components/sidebar/hooks/use-markdown-explorer.ts`
2. Rendering logic in `src/components/sidebar/tree/sidebar-tree.tsx`
3. DnD logic in `src/components/sidebar/tree/dnd-utils.ts`
4. API calls in `src/components/sidebar/api/markdown-actions.ts`

### When Working with File Uploads

1. Client-side config in `src/lib/uploads/config.ts`
2. API routes in `src/app/api/files/*`
3. Storage utilities in `src/lib/file-storage.ts`
4. Tiptap integration in `src/components/tiptap/file-handler.tsx`

## Known Patterns & Conventions

### Code Style

- Use TypeScript strict mode
- Prefer async/await over promises
- Use Zod for validation
- Follow React hooks rules
- Use server actions sparingly (most API calls via fetch)

### Component Patterns

- Client components marked with `'use client'`
- Server components by default (Next.js 16 app router)
- UI components in `src/components/ui/` follow shadcn/ui patterns
- Form components use React Hook Form + Zod

### Data Fetching

- React Query for client-side data fetching
- Server components for initial data loading
- Optimistic updates where appropriate

### Error Handling

- API routes return JSON errors with appropriate status codes
- Client-side toast notifications (sonner)
- Form validation errors displayed inline

## Security Considerations

1. **Authentication**: All document operations require authentication
2. **File Uploads**:
   - Size limits enforced (client + server)
   - Type validation (allowed extensions)
   - Path normalization to prevent directory traversal
   - User isolation (files scoped to userId)
3. **SQL Injection**: Better-sqlite3 prepared statements used throughout
4. **XSS**: React escapes by default, Tiptap sanitizes HTML

## Current Limitations & TODOs

From README "Upcoming Enhancements":

1. **Stable sidebar tree data** - Eliminate flicker by caching `/api/markdown` responses
2. **Editor save integration** - Wire Tiptap autosave to markdown API

## Testing

- No test suite currently implemented
- Manual testing workflow:
  1. Sign up/sign in
  2. Create documents and folders
  3. Test drag-and-drop in sidebar
  4. Test document editing and autosave
  5. Test file uploads
  6. Test folder operations

## Git Worktree Context

This project uses git worktrees. The current worktree is:
- **Worktree**: `youthful-mcnulty`
- **Main repo**: `/Users/josephtaylor/CodeProjects3/text-editor`

When making commits, be aware of the worktree structure.

## Helpful Tips for AI Assistants

1. **Always read before editing**: Use the Read tool before making file changes
2. **Check related files**: Changes to API routes often require updating client-side code
3. **Database consistency**: If modifying schema, consider migration strategy
4. **Type safety**: Run `pnpm build` to check TypeScript errors
5. **Test authentication flows**: Many features require authenticated user context
6. **Check file paths**: Use absolute paths, be mindful of server/ vs src/ directories

## Questions to Ask When Unsure

- Should this be a server or client component?
- Does this require a database migration?
- Are there security implications for file access?
- Should this update be optimistic or pessimistic?
- Does this affect existing user data?
- Is authentication required for this endpoint?

## Additional Documentation

- Main documentation: `/README.md`
- File uploads: `/docs/README.md` (if exists)
- Database schema: `/sql/documents-schema.sql`

---

Last updated: 2025-11-25
