# Authentication System

This document describes the authentication system used in the Text Editor application.

## Overview

The application uses [Better Auth](https://www.better-auth.com/) for authentication. Better Auth is a modern authentication library that provides session management, user registration, and secure password handling.

## Architecture

### Authentication Flow

```
User Action
    │
    ├─► Sign Up/Sign In
    │       │
    │       └─► Better Auth API
    │               │
    │               ├─► Validate Credentials
    │               │
    │               ├─► Create/Verify Session
    │               │
    │               └─► Store Session (SQLite)
    │
    └─► Protected Route/API
            │
            └─► Session Validation
                    │
                    ├─► Valid → Allow Access
                    │
                    └─► Invalid → 401 Unauthorized
```

### Session Management

- **Storage**: Sessions are stored in SQLite database (`server/auth.sqlite`)
- **Expiration**: Sessions expire based on Better Auth configuration
- **Validation**: Every API request validates the session
- **Cookies**: Session cookies are set automatically by Better Auth

## Configuration

### Environment Variables

Required environment variables:

```env
BETTER_AUTH_SECRET=<64-character-hex-string>
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000
```

Optional environment variables:

```env
# Custom auth database path (default: server/auth.sqlite)
AUTH_SQLITE_PATH=/path/to/auth.sqlite
```

**Generate Secret**:
```bash
pnpm auth:secret
# Or manually:
openssl rand -hex 32
```

### Better Auth Setup

Configuration is in `src/lib/auth.ts`:

```typescript
export const auth = betterAuth({
  database: getDatabase(), // SQLite database
  emailAndPassword: {
    enabled: true,
  },
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET || "",
});
```

## Database Schema

Better Auth manages its own database schema in `server/auth.sqlite`. The schema is automatically created and migrated by Better Auth CLI.

### Initialization

```bash
pnpm auth:migrate
```

This command:
1. Reads the Better Auth configuration
2. Creates necessary tables in `server/auth.sqlite`
3. Sets up indexes and constraints

### Tables

Better Auth creates tables for:
- Users
- Sessions
- Accounts (for OAuth, if enabled)
- Verification tokens (for email verification, if enabled)

**Note**: Do not manually edit `server/auth.sqlite`. All changes should be made through Better Auth configuration and migrations.

## Authentication Methods

### Email/Password

Currently, only email/password authentication is enabled:

- **Sign Up**: Users register with email and password
- **Sign In**: Users authenticate with email and password
- **Password Hashing**: Handled automatically by Better Auth
- **Session Creation**: Automatic on successful authentication

### Future Options

Better Auth supports additional methods that can be enabled:
- OAuth providers (Google, GitHub, etc.)
- Magic links
- Two-factor authentication
- Social login

## API Routes

### Better Auth Endpoints

The application exposes Better Auth API routes at `/api/auth/[...all]`. This catch-all route handles all authentication operations:

- `POST /api/auth/sign-up` - User registration
- `POST /api/auth/sign-in` - User authentication
- `POST /api/auth/sign-out` - Session termination
- `GET /api/auth/session` - Get current session
- Additional Better Auth endpoints as configured

**Note**: These routes are handled automatically by Better Auth. For complete API documentation, refer to the [Better Auth Documentation](https://www.better-auth.com/docs).

## API Integration

### Client-Side

Better Auth provides a client library for React:

```typescript
import { authClient } from "@/lib/auth-client";

// Sign up
await authClient.signUp.email({
  email: "user@example.com",
  password: "password",
});

// Sign in
await authClient.signIn.email({
  email: "user@example.com",
  password: "password",
});

// Sign out
await authClient.signOut();

// Get session
const session = await authClient.getSession();
```

### Server-Side

Session validation in API routes:

```typescript
import { getSessionFromHeaders } from "@/lib/auth/session";

export async function GET(request: Request) {
  const session = await getSessionFromHeaders(request.headers);
  
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // Access user ID
  const userId = session.user.id;
  
  // Your protected logic here
}
```

### Session Utilities

The application provides session utilities in `src/lib/auth/session.ts`:

- `getSessionFromHeaders()` - Extract and validate session from request headers
- `getSession()` - Get current session (server-side)
- `requireSession()` - Throw error if no session (helper)

## Protected Routes

### Page Protection

Pages in `src/app/(app)/` are protected by default. The layout checks authentication:

```typescript
// src/app/(app)/layout.tsx
const session = await getSession();
if (!session) {
  redirect("/sign-in");
}
```

### API Route Protection

All API routes (except auth routes) require authentication:

```typescript
// Example: src/app/api/markdown/route.ts
export async function GET(request: Request) {
  const session = await getSessionFromHeaders(request.headers);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Protected logic
}
```

## User Data

### User Object

The session includes user information:

```typescript
interface AuthSession {
  user: {
    id: string;
    email: string;
    // Additional fields from Better Auth
  };
  session: {
    id: string;
    expiresAt: Date;
  };
}
```

### User ID Usage

The user ID is used throughout the application:
- **Document ownership**: `documents.user_id`
- **Folder ownership**: `folders.user_id`
- **File storage**: `server/uploads/<userId>/`
- **Data isolation**: All queries filter by `user_id`

## Security Considerations

### Password Security

- Passwords are hashed using secure algorithms (handled by Better Auth)
- Passwords are never stored in plain text
- Password validation rules can be configured

### Session Security

- Sessions are stored server-side (SQLite)
- Session cookies are HTTP-only (prevents XSS)
- Session expiration prevents indefinite access
- Session validation on every request

### CSRF Protection

Better Auth includes CSRF protection:
- CSRF tokens for state-changing operations
- Same-site cookie attributes
- Origin validation

### SQL Injection

- Better Auth uses parameterized queries
- User input is validated and sanitized
- No raw SQL queries with user input

## Development

### Testing Authentication

1. **Sign Up**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-up \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}'
   ```

2. **Sign In**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-in \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}'
   ```

3. **Access Protected Route**:
   ```bash
   curl http://localhost:3000/api/markdown \
     -H "Cookie: better-auth.session_token=..."
   ```

### Resetting Auth Database

If you need to reset authentication:

```bash
# Remove auth database
rm server/auth.sqlite

# Recreate
pnpm auth:migrate
```

**Note**: This will delete all users and sessions. Use only in development.

## Admin Access

The application includes a comprehensive admin system for user management and audit logging. The admin console is accessible at `/admin` (under the authenticated `(app)` layout). Only users with admin privileges can access these pages.

### Admin Dashboard

The admin dashboard at `/admin` provides quick access to:
- **Users Management** (`/admin/users`) - Manage user accounts, admin roles, and sessions
- **Audit Log** (`/admin/audit`) - View history of admin actions

### User Management

The admin users page (`/admin/users`) allows administrators to:

- **List Users**: View all users with their email, name, admin status, active session count, and creation date
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

### Audit Log

The admin audit log (`/admin/audit`) provides a complete history of all admin actions:

- **Action Tracking**: Every admin action is automatically logged with:
  - Actor (admin who performed the action)
  - Target user (if applicable)
  - Action type (create_user, set_admin, revoke_sessions, set_password, delete_user)
  - IP address and user agent (when available)
  - Metadata specific to each action type
  - Timestamp
  
- **Pagination**: Audit log supports pagination with configurable page size (default 50, max 200)
- **Chronological Order**: Actions are displayed newest first
- **Detailed Metadata**: Each action includes relevant metadata (e.g., whether admin access was granted, number of sessions revoked)

### Promoting the First Admin

Since admin-only routes require an admin session, bootstrap the first admin via the helper script:

```bash
pnpm tsx scripts/promote-admin.ts you@example.com
```

The script writes to `server/auth.sqlite` (or `AUTH_SQLITE_PATH` if set) and creates the `admin_roles` table if it does not exist.

### Admin Action Logging

All admin actions are automatically recorded in the `admin_actions` table:

- **Automatic Logging**: Admin API routes automatically log actions via `recordAdminAction()`
- **IP and User Agent**: Captured from request headers when available
- **Metadata Storage**: Action-specific metadata is stored as JSON
- **Audit Trail**: Provides complete audit trail for compliance and debugging

### Database Tables

The admin system uses two additional tables in `server/auth.sqlite`:

- **`admin_roles`**: Stores admin status for each user (`user_id`, `is_admin`, `created_at`)
- **`admin_actions`**: Stores audit log entries (`id`, `actor_user_id`, `action`, `target_user_id`, `ip`, `user_agent`, `metadata`, `created_at`)

These tables are automatically created when the admin system is first used. See [Database Schema](./database-schema.md) for detailed table schemas.

## Troubleshooting

### "Unauthorized" Errors

1. Check if session cookie is being sent
2. Verify `BETTER_AUTH_SECRET` is set correctly
3. Ensure session hasn't expired
4. Check database connection

### Session Not Persisting

1. Verify cookie settings in Better Auth config
2. Check browser cookie settings
3. Ensure `BETTER_AUTH_URL` matches your domain
4. Check for HTTPS/HTTP mismatch

### Database Errors

1. Ensure `server/auth.sqlite` exists
2. Run `pnpm auth:migrate` to create schema
3. Check file permissions
4. Verify SQLite is working

## Related Documentation

- [Development Guide](./development-guide.md) - Setup instructions
- [API Reference](./api-reference.md) - API endpoints
- [Database Schema](./database-schema.md) - Database structure
- [Better Auth Documentation](https://www.better-auth.com/docs) - Official docs
