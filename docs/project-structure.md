# Project Structure

This document provides a detailed explanation of the project's directory structure and the purpose of each major component.

## Root Directory

```
text-editor/
├── docs/                    # Documentation (this directory)
├── llm/                     # LLM-related documentation
├── public/                  # Static assets
├── scripts/                 # Utility scripts
├── server/                  # Server-side data storage
├── sql/                     # SQL schema and migrations
├── src/                     # Source code
├── .github/                 # GitHub workflows
├── Dockerfile               # Docker build configuration
├── docker-compose.yml       # Docker Compose configuration
├── package.json             # Dependencies and scripts
└── README.md                # Project overview
```

## Source Code (`src/`)

### Application Routes (`src/app/`)

Next.js App Router structure:

```
src/app/
├── (app)/                   # Authenticated routes group
│   ├── documents/           # Document management
│   │   ├── [id]/           # Individual document page
│   │   │   └── page.tsx
│   │   └── page.tsx         # Documents list page
│   ├── layout.tsx           # App layout with sidebar
│   ├── page.tsx             # Home/dashboard page
│   └── profile/             # User profile
│       └── page.tsx
├── (auth)/                  # Authentication routes group
│   ├── layout.tsx           # Auth layout (centered)
│   ├── sign-in/
│   │   └── page.tsx
│   └── sign-up/
│       └── page.tsx
├── api/                     # API routes
│   ├── auth/
│   │   └── [...all]/        # Better Auth catch-all route
│   │       └── route.ts
│   ├── files/               # File upload/management API
│   │   ├── _utils.ts        # Shared utilities
│   │   ├── delete/
│   │   │   └── route.ts
│   │   ├── raw/
│   │   │   └── route.ts     # File streaming
│   │   ├── serve/
│   │   │   └── route.ts     # File URL generation
│   │   └── upload/
│   │       └── route.ts
│   └── markdown/            # Document management API
│       └── route.ts
├── help/                    # Help page
│   └── page.tsx
├── terminal/                # Terminal page
│   └── page.tsx
├── layout.tsx               # Root layout
├── globals.css              # Global styles
└── favicon.ico
```

### Components (`src/components/`)

Reusable React components organized by feature:

```
src/components/
├── auth/                    # Authentication components
│   ├── sign-in-form.tsx
│   ├── sign-up-form.tsx
│   └── user-menu.tsx
├── documents/               # Document-related components
│   ├── document-editor.tsx  # Main editor wrapper
│   ├── document-title-editor.tsx
│   └── empty-documents-state.tsx
├── profile/                 # Profile components
│   └── profile-settings.tsx
├── sidebar/                 # Sidebar components
│   ├── app-sidebar.tsx      # Main sidebar
│   └── app-sidebar-logo.tsx
├── tiptap/                  # Tiptap editor components
│   ├── tiptap.tsx           # Main editor component
│   ├── file-handler.tsx     # File drop/paste handler
│   ├── file-storage-manager.ts  # File upload utilities
│   ├── custom-image-view.tsx    # Image node view
│   ├── file-node-view.tsx       # File node view
│   ├── file-document-preview.tsx # Document preview
│   ├── bubble-menu.tsx          # Floating menu
│   ├── fixed-menu.tsx           # Fixed toolbar
│   ├── code-block.tsx           # Code block extension
│   ├── file-node.tsx            # File node extension
│   ├── file-cleanup.ts          # File cleanup utilities
│   ├── types.ts                 # TypeScript types
│   └── README.md                # Tiptap-specific docs
├── ui/                      # shadcn/ui components
│   ├── button.tsx
│   ├── input.tsx
│   ├── sidebar.tsx
│   └── ... (many more)
├── dynamic-breadcrumbs.tsx
├── providers.tsx            # React context providers
├── report-issue-button.tsx
└── theme-provider.tsx       # Theme management
```

### Libraries (`src/lib/`)

Core business logic and utilities:

```
src/lib/
├── auth/                    # Better Auth configuration
│   ├── auth.ts              # Main auth instance
│   ├── auth-client.ts       # Client-side auth
│   ├── constants.ts
│   ├── crypto.ts
│   ├── database.ts
│   ├── errors.ts
│   ├── session.ts           # Session utilities
│   ├── store.ts
│   └── types.ts
├── db.ts                    # Database connection (documents.db)
├── file-storage.ts          # File storage utilities
├── markdown-files.ts        # Document CRUD operations
├── uploads/
│   └── config.ts            # Upload configuration
└── utils.ts                 # General utilities
```

### Hooks (`src/hooks/`)

Custom React hooks:

```
src/hooks/
├── use-copy-to-clipboard.ts
└── use-mobile.ts
```

## Server Directory (`server/`)

Persistent data storage (not committed to git):

```
server/
├── auth.sqlite              # Better Auth database
├── documents.db             # Documents metadata database
├── documents/               # Markdown files
│   ├── demo-folder/
│   │   └── welcome-to-text-editor.md
│   └── <userId>/
│       └── ...
├── uploads/                 # User file uploads
│   └── <userId>/
│       └── notes/
│           └── ...
└── README.md                # Database migration guide
```

**Note**: SQLite files (`.db`, `.sqlite`) and their WAL files (`.db-shm`, `.db-wal`) are created at runtime and not committed to version control.

## SQL Directory (`sql/`)

Database schema and migrations:

```
sql/
├── documents-schema.sql        # Canonical schema for documents.db
├── documents-seed.sql         # Seed data for new databases
└── migrations/                # Incremental migrations (if any)
    └── YYYYMMDD_description.sql
```

## Scripts (`scripts/`)

Utility scripts:

```
scripts/
└── setup-databases.ts        # Database initialization script
```

This script:
- Creates `server/documents.db` if it doesn't exist
- Applies schema from `sql/documents-schema.sql`
- Seeds data from `sql/documents-seed.sql` if database is empty

## Documentation (`docs/`)

Project documentation:

```
docs/
├── README.md                 # Documentation index (this file)
├── architecture.md           # System architecture
├── project-structure.md      # This file
├── development-guide.md     # Development setup
├── api-reference.md          # API documentation
├── authentication.md         # Auth system docs
├── database-schema.md        # Database structure
├── file-storage.md           # File upload system
└── deployment.md             # Deployment guide
```

## Configuration Files

### Root Level

- **`package.json`** - Dependencies and npm scripts
- **`tsconfig.json`** - TypeScript configuration
- **`next.config.ts`** - Next.js configuration
- **`tailwind.config.ts`** - Tailwind CSS configuration
- **`postcss.config.mjs`** - PostCSS configuration
- **`eslint.config.mjs`** - ESLint configuration
- **`components.json`** - shadcn/ui configuration

### Docker

- **`Dockerfile`** - Container build instructions
- **`docker-compose.yml`** - Local development container setup
- **`docker-compose.override.yml`** - Production overrides (for CI/CD)

### GitHub

- **`.github/workflows/deploy.yml`** - CI/CD deployment workflow

## Public Assets (`public/`)

Static files served directly:

```
public/
└── (static assets like images, icons, etc.)
```

## Key File Patterns

### API Routes
- Location: `src/app/api/*/route.ts`
- Pattern: Export `GET`, `POST`, `PATCH`, `DELETE` functions
- Authentication: All routes check for valid session

### Page Components
- Location: `src/app/**/page.tsx`
- Pattern: Server or client components
- Layout: Inherits from parent layout or root layout

### Library Functions
- Location: `src/lib/*.ts`
- Pattern: Pure functions or database operations
- No React dependencies (unless specifically needed)

### Components
- Location: `src/components/**/*.tsx`
- Pattern: React components with TypeScript
- Styling: Tailwind CSS classes

## Naming Conventions

### Files
- **Components**: `kebab-case.tsx` (e.g., `document-editor.tsx`)
- **Utilities**: `kebab-case.ts` (e.g., `file-storage.ts`)
- **Types**: `kebab-case.ts` or `types.ts` in component directories
- **API Routes**: `route.ts` in route directories

### Directories
- **Features**: `kebab-case` (e.g., `document-editor/`)
- **Components**: `kebab-case` (e.g., `app-sidebar/`)
- **API Routes**: `kebab-case` (e.g., `api/files/upload/`)

### Code
- **Variables/Functions**: `camelCase`
- **Components**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`

## Import Patterns

### Absolute Imports
The project uses TypeScript path aliases configured in `tsconfig.json`:
- `@/components/*` → `src/components/*`
- `@/lib/*` → `src/lib/*`
- `@/hooks/*` → `src/hooks/*`

### Example
```typescript
import { Button } from "@/components/ui/button";
import { getSessionFromHeaders } from "@/lib/auth/session";
import { useMobile } from "@/hooks/use-mobile";
```

## Related Documentation

- [Architecture Overview](./architecture.md) - System design
- [Development Guide](./development-guide.md) - Setup and workflow
- [API Reference](./api-reference.md) - API endpoints

