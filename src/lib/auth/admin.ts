import type { Database as DatabaseType } from "better-sqlite3";
import { rm } from "node:fs/promises";
import path from "node:path";

import { getAuthDb } from "./database";
import { getDatabase as getDocsDb } from "../db";
import { MARKDOWN_DIR } from "../markdown-files";
import { sanitizeUserSegment } from "../user-paths";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";

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

export type DeleteUserCascadeResult = {
  userId: string;
  deletedUser: boolean;
  deletedSessions: number;
  deletedAccounts: number;
  deletedAdminRole: number;
  deletedDocuments: number;
  deletedFolders: number;
  deletedUploadsDir: boolean;
  deletedDocumentsDir: boolean;
};

export type AdminCreateUserInput = {
  email: string;
  password: string;
  name?: string | null;
  isAdmin?: boolean;
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

function getFileStorageRoot() {
  return process.env.FILE_STORAGE_DIR
    ? path.isAbsolute(process.env.FILE_STORAGE_DIR)
      ? process.env.FILE_STORAGE_DIR
      : path.join(process.cwd(), process.env.FILE_STORAGE_DIR)
    : path.join(process.cwd(), "server", "uploads");
}

export function deleteUserCascade(userId: string): DeleteUserCascadeResult {
  const authDb = getDb();
  const docsDb = getDocsDb();

  // Ensure admin_roles table exists
  authDb.exec(
    `CREATE TABLE IF NOT EXISTS admin_roles (
      user_id TEXT PRIMARY KEY,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );`
  );

  // Documents DB cleanup
  const deletedDocuments = docsDb.prepare(`DELETE FROM documents WHERE user_id = ?`).run(userId).changes ?? 0;
  const deletedFolders = docsDb.prepare(`DELETE FROM folders WHERE user_id = ?`).run(userId).changes ?? 0;

  // File system cleanup (best-effort)
  const userSegment = sanitizeUserSegment(userId);
  if (!userSegment) {
    throw new Error("Invalid user identifier");
  }
  const docsDir = path.join(MARKDOWN_DIR, userSegment);
  const uploadsDir = path.join(getFileStorageRoot(), userSegment);

  // Fire-and-forget deletes; no throw if missing
  awaitCleanup(docsDir);
  awaitCleanup(uploadsDir);

  // Auth DB cleanup
  const deletedAdminRole = authDb.prepare(`DELETE FROM admin_roles WHERE user_id = ?`).run(userId).changes ?? 0;
  const deletedSessions = authDb.prepare(`DELETE FROM session WHERE userId = ?`).run(userId).changes ?? 0;
  const deletedAccounts = authDb.prepare(`DELETE FROM account WHERE userId = ?`).run(userId).changes ?? 0;
  const deletedUser = authDb.prepare(`DELETE FROM user WHERE id = ?`).run(userId).changes ?? 0;

  return {
    userId,
    deletedUser: Boolean(deletedUser),
    deletedSessions: deletedSessions || 0,
    deletedAccounts: deletedAccounts || 0,
    deletedAdminRole: deletedAdminRole || 0,
    deletedDocuments,
    deletedFolders,
    deletedUploadsDir: true,
    deletedDocumentsDir: true,
  };
}

function awaitCleanup(targetDir: string) {
  rm(targetDir, { force: true, recursive: true }).catch(() => {
    // Ignore missing directories or cleanup failures
  });
}

export async function createUserWithPassword(input: AdminCreateUserInput) {
  const { email, password, name = null, isAdmin = false } = input;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password.trim()) {
    throw new Error("Email and password are required");
  }

  const authDb = getDb();
  // ensure admin_roles exists
  authDb.exec(
    `CREATE TABLE IF NOT EXISTS admin_roles (
      user_id TEXT PRIMARY KEY,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );`
  );

  const existing = authDb
    .prepare(`SELECT id FROM user WHERE lower(email) = ? LIMIT 1`)
    .get(normalizedEmail) as { id: string } | undefined;
  if (existing) {
    throw new Error("Email already exists");
  }

  const userId = randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  const accountId = userId;

  const tx = authDb.transaction(() => {
    authDb
      .prepare(
        `INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
         VALUES (?, ?, ?, 0, NULL, ?, ?)`
      )
      .run(userId, name ?? null, normalizedEmail, now, now);

    authDb
      .prepare(
        `INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
         VALUES (?, ?, 'credential', ?, ?, ?, ?)`
      )
      .run(randomUUID(), accountId, userId, passwordHash, now, now);

    if (isAdmin) {
      authDb
        .prepare(
          `INSERT INTO admin_roles (user_id, is_admin, created_at)
           VALUES (?, 1, strftime('%s','now')*1000)
           ON CONFLICT(user_id) DO UPDATE SET is_admin = 1`
        )
        .run(userId);
    }
  });

  tx();

  return {
    id: userId,
    email: normalizedEmail,
    name,
    isAdmin,
    createdAt: now,
    sessionCount: 0,
  } satisfies AdminUserSummary;
}

export async function setUserPassword(userId: string, newPassword: string) {
  if (!newPassword.trim()) {
    throw new Error("Password is required");
  }
  const authDb = getDb();
  const hash = await hashPassword(newPassword);
  const now = new Date().toISOString();

  const existingAccount = authDb
    .prepare(`SELECT id FROM account WHERE userId = ? AND providerId = 'credential' LIMIT 1`)
    .get(userId) as { id: string } | undefined;

  if (existingAccount) {
    authDb
      .prepare(`UPDATE account SET password = ?, updatedAt = ? WHERE id = ?`)
      .run(hash, now, existingAccount.id);
  } else {
    authDb
      .prepare(
        `INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
         VALUES (?, ?, 'credential', ?, ?, ?, ?)`
      )
      .run(randomUUID(), userId, userId, hash, now, now);
  }
}
