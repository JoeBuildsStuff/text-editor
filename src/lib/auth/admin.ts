import type { Database as DatabaseType } from "better-sqlite3";

import { getAuthDb } from "./database";

function getDb(): DatabaseType {
  return getAuthDb();
}

export type AdminUserSummary = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  isAdmin: boolean;
  sessionCount: number;
};

export function listAdminUsers(): AdminUserSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT 
        u.id as id,
        u.email as email,
        u.name as name,
        u.createdAt as created_at,
        COALESCE(ar.is_admin, 0) as is_admin,
        (SELECT COUNT(1) FROM session s WHERE s.userId = u.id) as session_count
       FROM user u
       LEFT JOIN admin_roles ar ON ar.user_id = u.id
       ORDER BY u.createdAt DESC`
    )
    .all() as Array<{
      id: string;
      email: string;
      name: string | null;
      created_at: string;
      is_admin: number;
      session_count: number;
    }>;

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: new Date(row.created_at).toISOString(),
    isAdmin: Boolean(row.is_admin),
    sessionCount: Number(row.session_count) || 0,
  }));
}

export function setUserAdmin(userId: string, isAdmin: boolean): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO admin_roles (user_id, is_admin, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET is_admin=excluded.is_admin`
  ).run(userId, isAdmin ? 1 : 0, now);
}

export function deleteSessionsForUser(userId: string, sessionId?: string): number {
  const db = getDb();
  if (sessionId) {
    const result = db.prepare(`DELETE FROM session WHERE id = ? AND userId = ?`).run(sessionId, userId);
    return result.changes || 0;
  }
  const result = db.prepare(`DELETE FROM session WHERE userId = ?`).run(userId);
  return result.changes || 0;
}
