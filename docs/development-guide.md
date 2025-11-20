# Development Guide

This guide covers setting up your development environment, common workflows, and best practices for contributing to the project.

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **pnpm** 8+ (package manager)
- **Git** (version control)
- **SQLite** (for local database, usually comes with Node.js)

## Initial Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd text-editor
```

### 2. Install Dependencies

```bash
pnpm install
```

**Note**: The project uses `better-sqlite3` which requires native compilation. If you encounter build errors:
- **macOS**: Xcode Command Line Tools should be installed
- **Linux**: Install `build-essential` or equivalent
- **Windows**: Install Visual Studio Build Tools

### 3. Environment Configuration

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local  # If .env.example exists
```

Required environment variables:

```env
# Authentication
BETTER_AUTH_SECRET=<generate-with-pnpm-auth:secret>
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000

# Optional: Custom file storage directory
FILE_STORAGE_DIR=./server/uploads

# Optional: Custom database paths
DOCUMENTS_SQLITE_PATH=./server/documents.db
AUTH_SQLITE_PATH=./server/auth.sqlite

# Optional: Server configuration
PORT=3000
NEXT_TELEMETRY_DISABLED=1
```

**Generate Auth Secret**:
```bash
pnpm auth:secret
# Copy the output and paste it into BETTER_AUTH_SECRET
```

Or generate manually:
```bash
openssl rand -hex 32
```

### 4. Initialize Databases

The project uses two SQLite databases that are not committed to git:

```bash
pnpm db:init
```

This command:
1. Creates `server/documents.db` with schema and seed data
2. Creates `server/auth.sqlite` with Better Auth tables

**Individual commands**:
- `pnpm db:setup` - Only setup documents database
- `pnpm auth:migrate` - Only setup auth database

### 5. Start Development Server

```bash
pnpm dev
```

The application will be available at [http://localhost:3000](http://localhost:3000)

## Development Workflow

### Creating a New Document

1. Sign up or sign in at `/sign-up` or `/sign-in`
2. Click "New Document" in the sidebar
3. Start editing in the Tiptap editor
4. Document is automatically saved to the database and file system

### User-Facing Features

- **Help Page** (`/help`): User-facing documentation with instructions for creating documents, organizing folders, and using the editor features
- **Profile Page** (`/profile`): User profile management and settings

### Making Code Changes

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**:
   - Follow the project structure conventions
   - Write TypeScript with proper types
   - Use Tailwind CSS for styling
   - Follow existing code patterns

3. **Test your changes**:
   - Run the dev server: `pnpm dev`
   - Test the feature manually
   - Check for TypeScript errors: `pnpm build` (or use your IDE)

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

### Database Changes

When modifying the database schema:

1. **Create a migration**:
   ```bash
   # Create migration file
   touch sql/migrations/YYYYMMDD_description.sql
   ```

2. **Write the migration**:
   ```sql
   BEGIN TRANSACTION;

   -- Your schema changes here
   ALTER TABLE documents ADD COLUMN new_field TEXT;

   COMMIT;
   ```

3. **Update canonical schema**:
   - Update `sql/documents-schema.sql` to reflect the new structure

4. **Update seed data** (if needed):
   - Update `sql/documents-seed.sql` with new fields

5. **Test locally**:
   ```bash
   # Backup your database
   cp server/documents.db server/documents.db.bak
   
   # Apply migration
   sqlite3 server/documents.db < sql/migrations/YYYYMMDD_description.sql
   
   # Or recreate from scratch
   rm server/documents.db
   pnpm db:setup
   ```

See `server/README.md` for detailed migration guidelines.

### Working with the Sidebar Cache

The sidebar tree loads its data through **TanStack Query**:

- The `markdown-index` query wraps `/api/markdown` and normalizes the response in `fetchMarkdownIndex`.
- `useMarkdownExplorer` exposes helper callbacks that optimistically edit the cached result with `queryClient.setQueryData` and then call `invalidateQueries(MARKDOWN_INDEX_QUERY_KEY)` to re-sync with the server.
- When adding new sidebar mutations, wire them into this flow so the UI updates instantly and still refreshes from SQLite.
- Prefer reading `documents`/`folders` from the query cache instead of maintaining separate React state—this keeps React Compiler happy and prevents the loading spinner from flashing.

### Adding New API Routes

1. **Create route file**:
   ```
   src/app/api/your-feature/route.ts
   ```

2. **Implement handlers**:
   ```typescript
   import { NextResponse } from "next/server";
   import { getSessionFromHeaders } from "@/lib/auth/session";

   export async function GET(request: Request) {
     const session = await getSessionFromHeaders(request.headers);
     if (!session) {
       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
     }
     
     // Your logic here
     return NextResponse.json({ data: "result" });
   }
   ```

3. **Add validation**:
   - Use Zod for request validation
   - Follow existing patterns in `src/app/api/markdown/route.ts`

4. **Document in API Reference**:
   - Update `docs/api-reference.md` with your new endpoint

### Adding New Components

1. **Choose location**:
   - Feature-specific: `src/components/your-feature/`
   - Reusable UI: `src/components/ui/` (if using shadcn/ui)
   - Shared: `src/components/`

2. **Create component**:
   ```typescript
   // src/components/your-feature/my-component.tsx
   "use client"; // If using client-side features

   export function MyComponent() {
     return <div>Your component</div>;
   }
   ```

3. **Add TypeScript types**:
   - Define props interface
   - Export types if needed

4. **Style with Tailwind**:
   ```typescript
   <div className="flex items-center gap-2 p-4">
     {/* Your content */}
   </div>
   ```

## Common Tasks

### Resetting the Database

If you need to start fresh:

```bash
# Remove databases
rm server/documents.db server/auth.sqlite

# Recreate
pnpm db:init
```

### Viewing Database Contents

```bash
# Using sqlite3 CLI
sqlite3 server/documents.db

# Then run SQL queries
.tables
SELECT * FROM documents;
```

### Debugging

1. **Server-side logs**:
   - Check terminal where `pnpm dev` is running
   - Use `console.log()` or `console.error()`

2. **Client-side logs**:
   - Open browser DevTools
   - Check Console tab
   - Check Network tab for API requests

3. **Database inspection**:
   - Use SQLite browser tools
   - Or use `sqlite3` CLI

### Running Production Build Locally

```bash
# Build the application
pnpm build

# Start production server
pnpm start
```

**Note**: The build process uses the `--webpack` flag to ensure proper handling of native modules like `better-sqlite3`. The webpack configuration externalizes `better-sqlite3` on the server-side to avoid bundling issues.

## Code Style & Conventions

### TypeScript

- Use TypeScript for all files (`.ts`, `.tsx`)
- Define explicit types for function parameters and returns
- Use interfaces for object shapes
- Prefer `type` for unions and intersections

### React

- Use functional components with hooks
- Prefer Server Components when possible
- Use `"use client"` directive only when needed
- Keep components focused and small

### Styling

- Use Tailwind CSS utility classes
- Follow existing component patterns
- Use shadcn/ui components when available
- Maintain consistent spacing and colors

### File Organization

- Group related files in feature directories
- Keep components close to where they're used
- Extract reusable logic to `src/lib/`
- Use absolute imports with `@/` prefix
- When working on Tiptap markdown with file uploads, use `file-node-serialization.ts` helpers instead of raw `editor.getMarkdown()` so file nodes round-trip correctly, and use `sanitizeUserSegment` for any user-relative paths

### Naming

- **Components**: PascalCase (`DocumentEditor.tsx`)
- **Files**: kebab-case (`document-editor.tsx`)
- **Functions/Variables**: camelCase (`getDocumentById`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_FILE_SIZE`)

## Testing

Currently, the project relies on manual testing. For new features:

1. **Test happy path**: Normal user flow works
2. **Test error cases**: Invalid inputs, missing data
3. **Test edge cases**: Empty states, large files, etc.
4. **Test authentication**: Unauthorized access is blocked

## Troubleshooting

### Database Locked Errors

If you see "database is locked" errors:

1. Check if another process is using the database
2. Ensure WAL mode is enabled (should be automatic)
3. Restart the dev server

### Build Errors

1. **Native module errors** (better-sqlite3):
   - Ensure build tools are installed
   - Try `pnpm rebuild better-sqlite3`

2. **TypeScript errors**:
   - Run `pnpm build` to see all errors
   - Fix type issues incrementally
   - For memory-constrained environments, set `SKIP_TYPE_CHECK=true` to skip type checking during build

3. **Import errors**:
   - Check `tsconfig.json` path aliases
   - Ensure imports use `@/` prefix

### Port Already in Use

If port 3000 is already in use:

```bash
# Find and kill the process
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 pnpm dev
```

## Useful Commands

```bash
# Development
pnpm dev              # Start dev server
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint

# Database
pnpm db:init          # Initialize all databases
pnpm db:setup         # Setup documents database only
pnpm auth:migrate     # Setup auth database only
pnpm auth:secret      # Generate auth secret

# Dependencies
pnpm install          # Install dependencies
pnpm update           # Update dependencies
```

## Getting Help

- Check existing documentation in `docs/`
- Review similar code in the codebase
- Check Next.js, Tiptap, and Better Auth documentation
- Review GitHub issues and discussions

## Related Documentation

- [Architecture Overview](./architecture.md) - System design
- [Project Structure](./project-structure.md) - Codebase organization
- [API Reference](./api-reference.md) - API endpoints
- [Database Schema](./database-schema.md) - Database structure
