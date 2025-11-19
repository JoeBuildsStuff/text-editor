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

An admin console lives at `/admin/users` (under the authenticated `(app)` layout). Only users flagged as admin can reach it. Admins can:
- List users with session counts
- Toggle admin access
- Revoke sessions for a user

### Promoting the First Admin

Since admin-only routes require an admin session, bootstrap the first admin via the helper script:

```bash
pnpm tsx scripts/promote-admin.ts you@example.com
```

The script writes to `server/auth.sqlite` (or `AUTH_SQLITE_PATH` if set) and creates the `admin_roles` table if it does not exist.

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
