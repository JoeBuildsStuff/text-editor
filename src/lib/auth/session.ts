import { headers } from "next/headers";

import { auth } from "../auth";
import { getAuthDb } from "./database";
import { ensureAdminTables } from "./admin";
import type { AuthSession } from "./types";

function getIsAdmin(userId: string): boolean {
  const db = getAuthDb();
  ensureAdminTables(db);
  const row = db
    .prepare(`SELECT is_admin FROM admin_roles WHERE user_id = ?`)
    .get(userId) as { is_admin: number } | undefined;
  return Boolean(row?.is_admin);
}

function toAuthSession(session: Awaited<ReturnType<typeof auth.api.getSession>>): AuthSession | null {
  if (!session?.session || !session?.user) {
    return null;
  }

  const isAdmin = getIsAdmin(session.user.id);

  return {
    sessionId: session.session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      createdAt: new Date(session.user.createdAt).toISOString(),
      isAdmin,
    },
    expiresAt: new Date(session.session.expiresAt).toISOString(),
    rememberMe: new Date(session.session.expiresAt).getTime() > Date.now() + 24 * 60 * 60 * 1000, // If expires in more than 1 day, consider it "remember me"
  };
}

export async function getServerSession(): Promise<AuthSession | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    return toAuthSession(session);
  } catch {
    return null;
  }
}

export async function getSessionFromHeaders(headers: Headers): Promise<AuthSession | null> {
  try {
    const session = await auth.api.getSession({
      headers,
    });
    return toAuthSession(session);
  } catch {
    return null;
  }
}

export async function requireAdminSession(headers: Headers): Promise<AuthSession | null> {
  const session = await getSessionFromHeaders(headers);
  if (!session) return null;
  return session.user.isAdmin ? session : null;
}
