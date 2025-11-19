import { NextResponse } from "next/server";

import {
  createUserWithPassword,
  listAdminUsers,
  recordAdminAction,
  setUserAdmin,
} from "@/lib/auth/admin";
import { getSessionFromHeaders } from "@/lib/auth/session";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function clientIp(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    null
  );
}

export async function GET(request: Request) {
  const session = await getSessionFromHeaders(request.headers);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();

  const users = listAdminUsers();
  return NextResponse.json({ users });
}

export async function PATCH(request: Request) {
  const session = await getSessionFromHeaders(request.headers);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, isAdmin } = (body ?? {}) as { userId?: string; isAdmin?: boolean };
  if (!userId || typeof isAdmin !== "boolean") {
    return NextResponse.json({ error: "userId and isAdmin are required" }, { status: 400 });
  }

  setUserAdmin(userId, isAdmin);
  const updated = listAdminUsers().find((u) => u.id === userId);

  recordAdminAction({
    actorUserId: session.user.id,
    action: "set_admin",
    targetUserId: userId,
    ip: clientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    metadata: { isAdmin },
  });

  return NextResponse.json({ user: updated ?? { id: userId, isAdmin } });
}

export async function POST(request: Request) {
  const session = await getSessionFromHeaders(request.headers);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();

  let body: { email?: string; password?: string; name?: string; isAdmin?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, password, name, isAdmin } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  try {
    const user = await createUserWithPassword({ email, password, name, isAdmin });
    const refreshed = listAdminUsers().find((u) => u.id === user.id) ?? user;
    recordAdminAction({
      actorUserId: session.user.id,
      action: "create_user",
      targetUserId: user.id,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
      metadata: { isAdmin: Boolean(isAdmin), email: user.email },
    });
    return NextResponse.json({ user: refreshed }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create user";
    const status = message.toLowerCase().includes("exists") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
