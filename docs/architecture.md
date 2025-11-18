# Architecture Overview

This document provides a high-level overview of the Text Editor application architecture, technology stack, and key design decisions.

## System Overview

The Text Editor is a full-stack web application that provides a markdown-based text editing experience with document organization, file uploads, and user authentication. It follows a hybrid storage model combining SQLite for metadata and the file system for content.

## Technology Stack

### Frontend
- **Next.js 16** - React framework with App Router
- **React 19** - UI library
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
