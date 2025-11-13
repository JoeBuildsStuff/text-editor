import { randomUUID } from "node:crypto";

import { DEFAULT_SESSION_MAX_AGE_DAYS, REMEMBER_ME_MAX_AGE_DAYS } from "./constants";
import { generateSessionToken, hashPassword, hashToken, verifyPassword } from "./crypto";
import { getAuthDb } from "./database";
import { AuthError } from "./errors";
import type { AuthSession, AuthUser, CreatedSession } from "./types";

const db = getAuthDb();

function mapUser(row: {
  id: string;
  email: string;
  name: string | null;
  created_at: number;
}): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function createUser({
  email,
  password,
  name,
}: {
  email: string;
  password: string;
  name: string;
}): AuthUser {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = db
    .prepare(`SELECT id FROM users WHERE email = ?`)
    .get(normalizedEmail) as { id: string } | undefined;

  if (existing) {
    throw new AuthError("Email is already registered", 409);
  }

  const id = randomUUID();
  const passwordHash = hashPassword(password);
  const createdAt = Date.now();

  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, normalizedEmail, name.trim(), passwordHash, createdAt);

  return {
    id,
    email: normalizedEmail,
    name: name.trim(),
    createdAt: new Date(createdAt).toISOString(),
  };
}

export function findUserByEmail(email: string): (AuthUser & { passwordHash: string }) | null {
  const normalizedEmail = email.trim().toLowerCase();
  const row = db
    .prepare(`SELECT id, email, name, created_at, password_hash FROM users WHERE email = ?`)
    .get(normalizedEmail) as
    | {
        id: string;
        email: string;
        name: string | null;
        created_at: number;
        password_hash: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  const { password_hash: passwordHash, ...rest } = row;
  return { ...mapUser(rest), passwordHash };
}

export function verifyUserCredentials({
  email,
  password,
}: {
  email: string;
  password: string;
}): AuthUser | null {
  const user = findUserByEmail(email);
  if (!user) {
    return null;
  }

  const isValid = verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;
  void _passwordHash;
  return safeUser;
}

function sessionExpiry(rememberMe: boolean): Date {
  const days = rememberMe ? REMEMBER_ME_MAX_AGE_DAYS : DEFAULT_SESSION_MAX_AGE_DAYS;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

export function createSessionForUser(
  user: AuthUser,
  rememberMe: boolean = true
): CreatedSession {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const id = randomUUID();
  const createdAt = Date.now();
  const expiresAt = sessionExpiry(rememberMe);

  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, remember_me)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    user.id,
    tokenHash,
    expiresAt.getTime(),
    createdAt,
    rememberMe ? 1 : 0
  );

  return {
    token,
    session: {
      sessionId: id,
      user,
      rememberMe,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export function getSessionByToken(token: string): AuthSession | null {
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT s.id as session_id,
              u.id as user_id,
              u.email as email,
              u.name as name,
              u.created_at as user_created_at,
              s.expires_at as expires_at,
              s.remember_me as remember_me
         FROM sessions s
         INNER JOIN users u ON s.user_id = u.id
        WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | {
        session_id: string;
        user_id: string;
        email: string;
        name: string | null;
        user_created_at: number;
        expires_at: number;
        remember_me: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  if (row.expires_at <= Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(row.session_id);
    return null;
  }

  return {
    sessionId: row.session_id,
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      createdAt: new Date(row.user_created_at).toISOString(),
    },
    expiresAt: new Date(row.expires_at).toISOString(),
    rememberMe: Boolean(row.remember_me),
  };
}

export function deleteSessionByToken(token: string): void {
  const tokenHash = hashToken(token);
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
}
