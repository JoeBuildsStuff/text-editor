import { NextResponse } from "next/server";

import { listAdminUsers, setUserAdmin } from "@/lib/auth/admin";
import { getSessionFromHeaders } from "@/lib/auth/session";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  return NextResponse.json({ user: updated ?? { id: userId, isAdmin } });
}
