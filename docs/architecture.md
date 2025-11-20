# Architecture Overview

This document provides a high-level overview of the Text Editor application architecture, technology stack, and key design decisions.

## System Overview

The Text Editor is a full-stack web application that provides a markdown-based text editing experience with document organization, file uploads, and user authentication. It follows a hybrid storage model combining SQLite for metadata and the file system for content.

## Technology Stack

### Frontend
- **Next.js 16** - React framework with App Router
- **React 19** - UI library with React Compiler enabled
- **TypeScript** - Type safety
- **Tiptap 3** - Rich text editor framework
- **Tailwind CSS 4** - Styling
- **Radix UI** - Accessible component primitives
- **shadcn/ui** - UI component library built on Radix

### Backend
- **Next.js API Routes** - Server-side API endpoints
- **Better Auth** - Authentication library
- **Better SQLite3** - SQLite database driver
- **Zod** - Schema validation

### Storage
- **SQLite** - Metadata storage (documents, folders, auth)
- **File System** - Markdown content and user uploads
- **WAL Mode** - Write-Ahead Logging for better concurrency

## Architecture Patterns

### Hybrid Storage Model

The application uses a hybrid approach to storage:

```
┌─────────────────────────────────────────┐
│         Application Layer               │
│  (Next.js API Routes + Components)      │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌──────▼──────────┐
│  SQLite DB  │  │  File System    │
│             │  │                 │
│ • Metadata  │  │ • Markdown      │
│ • Auth      │  │ • Uploads       │
│ • Indexes   │  │ • User files    │
└─────────────┘  └─────────────────┘
```

**Benefits:**
- Metadata queries are fast (indexed SQLite)
- Content is version-control friendly (plain markdown files)
- Easy to edit content with external tools
- Simple backup strategy (copy files + database)

### Request Flow

```
User Request
    │
    ├─► Authentication Check (Better Auth)
    │       │
    │       └─► Session Validation
    │
    ├─► API Route Handler
    │       │
    │       ├─► Input Validation (Zod)
    │       │
    │       ├─► Business Logic
    │       │       │
    │       │       ├─► Database Operations (SQLite)
    │       │       │
    │       │       └─► File System Operations
    │       │
    │       └─► Response
    │
    └─► Client Update (React)
```

### Component Architecture

```
App Layout
    │
    ├─► App Sidebar (Document Tree)
    │       │
    │       └─► Document List Component
    │
    ├─► Main Content Area
    │       │
    │       ├─► Document Editor
    │       │       │
    │       │       ├─► Title Editor
    │       │       │
    │       │       └─► Tiptap Editor
    │       │               │
    │       │               ├─► File Handler Extension
    │       │               ├─► Image Node View
    │       │               └─► File Node View
    │       │
    │       └─► Empty State
    │
    └─► User Menu (Auth)
```

### Sidebar Data Fetching & Caching

The sidebar’s document tree keeps its state in the browser using **TanStack Query**:

- `useMarkdownExplorer` subscribes to a single `markdown-index` query that mirrors the `/api/markdown` response.
- `fetchMarkdownIndex` normalizes API payloads into strict `documents[]` + `folders[]` collections so every consumer sees consistent shapes.
- The cached value remains visible during refetches, eliminating the flicker that previously occurred when the component reset to an empty list.
- Create/delete/move/rename/reorder actions optimistically edit the cached tree, then invalidate the query so SQLite stays authoritative.
- Because the cache is client-side, navigating between documents reuses the same tree (until a hard refresh), improving perceived performance.

This pattern provides “stale-while-revalidate” behavior for the sidebar without introducing extra server complexity.

## Key Design Decisions

### 1. UUID-Based Document IDs

Documents use UUIDs as primary identifiers instead of auto-incrementing IDs or slugs. This provides:
- **Stability**: IDs don't change when documents are moved or renamed
- **Security**: Non-sequential IDs prevent enumeration attacks
- **Distributed**: Can generate IDs without database coordination

### 2. Title vs Filename Separation

Document titles (display names) are stored separately from file paths:
- Users see friendly titles in the UI
- File system uses sanitized, valid paths
- Titles can be changed without affecting file structure

### 3. Local-First File Storage

All file uploads are stored locally on the server:
- No external storage dependencies (S3, Supabase, etc.)
- Full control over file access and security
- Simpler deployment (no additional services)
- User-scoped storage (`server/uploads/<userId>/`)

### 4. Markdown as Source of Truth

Editor content is stored as markdown:
- Human-readable format
- Version-control friendly
- Can be edited with external tools
- Easy to export/import

### 5. Server-Side Rendering (SSR)

Next.js App Router with SSR:
- Fast initial page loads
- SEO-friendly (if needed)
- Server-side authentication checks
- API routes co-located with pages

### 6. React Compiler

The application uses React Compiler (enabled in `next.config.ts`) for automatic optimization:
- Compile-time optimizations
- Reduced re-renders
- Better performance without manual memoization

### 7. Native Module Handling

The build process uses custom webpack configuration to handle native modules:
- `better-sqlite3` is externalized on the server-side
- Prevents bundling issues with native SQLite bindings
- Configured via `serverExternalPackages` in Next.js config

## Data Flow

### Document Creation Flow

```
1. User clicks "New Document"
   │
2. POST /api/markdown
   │
3. Generate UUID
   │
4. Sanitize title → filename
   │
5. Create database record (SQLite)
   │
6. Create markdown file (File System)
   │
7. Return document metadata
   │
8. Navigate to /documents/[id]
   │
9. Load document content
   │
10. Render in Tiptap editor
```

### File Upload Flow

```
1. User drops/pastes file
   │
2. File Handler Extension intercepts
   │
3. POST /api/files/upload
   │
4. Validate file (type, size)
   │
5. Generate unique filename
   │
6. Save to server/uploads/<userId>/
   │
7. Return file path
   │
8. Insert into editor as node
   │
9. Store path in markdown content (file nodes are serialized as `file-node://` links so they survive markdown save/load)
```

### Document Load Flow

```
1. User navigates to /documents/[id]
   │
2. Server fetches document metadata (SQLite)
   │
3. Server reads markdown file
   │
4. Parse markdown → Tiptap JSON
   │
5. Render editor with content
   │
6. Restore `file-node://` links back into file nodes (user segment reapplied to paths)
   │
7. For each file reference:
   │   │
   │   └─► GET /api/files/serve?path=...
   │       │
   │       └─► Return temporary URL
   │
8. Display files in editor
```

## Security Architecture

### Authentication
- **Better Auth** handles session management
- Sessions stored in SQLite (`server/auth.sqlite`)
- All API routes require authentication
- Session validation on every request

### Authorization
- User-scoped data access
- Database queries filtered by `user_id`
- File system paths scoped to user ID
- No cross-user data access
- Admin role-based access control for privileged operations

### Admin System
The application includes a comprehensive admin system for user management and audit logging:

- **Admin Dashboard**: Centralized admin interface at `/admin` with access to user management and audit logs
- **User Management**: Full CRUD operations for user accounts:
  - List all users with admin status and session counts
  - Create new user accounts with optional admin privileges
  - Toggle admin status for existing users
  - Revoke user sessions (force logout)
  - Reset user passwords
  - Delete users with cascade cleanup (removes documents, uploads, sessions, and database records)
- **Audit Logging**: Automatic logging of all admin actions:
  - All admin operations are recorded in `admin_actions` table
  - Captures actor, target user, action type, IP address, user agent, and metadata
  - Provides complete audit trail for compliance and debugging
- **Admin Tables**: Additional tables in `auth.sqlite`:
  - `admin_roles`: Stores admin privileges per user
  - `admin_actions`: Stores audit log entries with full context
- **Access Control**: Admin routes require both authentication and admin role verification

### Input Validation
- **Zod schemas** for all API inputs
- File type and size validation
- Path sanitization to prevent directory traversal
- SQL injection prevention (parameterized queries)

### File Security
- Files stored in user-scoped directories
- Path validation prevents traversal attacks
- Temporary URLs for file access
- Authentication required for all file operations

## Performance Considerations

### Database Optimization
- Indexes on frequently queried columns (`user_id`, `document_path`)
- WAL mode for better concurrency
- Connection pooling via Better SQLite3
- Transactions for atomic operations

### File System
- Lazy loading of document content
- File paths stored instead of base64 in content
- Temporary URLs for file access (not persisted)
- Efficient file serving via streaming

### Frontend
- React Server Components where possible
- Client-side caching of document tree
- Optimistic UI updates
- Code splitting via Next.js

## Scalability Considerations

### Current Limitations
- Single SQLite database (not distributed)
- File system storage (limited by disk space)
- Single server deployment

### Future Scalability Options
- **Database**: Migrate to PostgreSQL for multi-server support
- **Storage**: Move to object storage (S3, etc.) for file uploads
- **Caching**: Add Redis for session and document caching
- **CDN**: Use CDN for static assets and file serving
- **Load Balancing**: Multiple app servers behind load balancer

## Development vs Production

### Development
- Hot module reloading
- SQLite databases in `server/` directory
- File uploads in `server/uploads/`
- Local authentication

### Production
- Docker containerization
- Environment variables for configuration
- Database and files persisted via volumes
- CI/CD via GitHub Actions
- Optimized builds with Next.js

## Related Documentation

- [Project Structure](./project-structure.md) - Detailed directory structure
- [Database Schema](./database-schema.md) - Database design
- [File Storage System](./file-storage.md) - File upload architecture
- [API Reference](./api-reference.md) - API endpoints
- [Deployment Guide](./deployment.md) - Production deployment
