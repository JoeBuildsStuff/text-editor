import { NextResponse } from "next/server";

import { recordAdminAction, setUserPassword } from "@/lib/auth/admin";
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromHeaders(request.headers);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  let body: { password?: string } = {};
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.password) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  try {
    await setUserPassword(id, body.password);
    recordAdminAction({
      actorUserId: session.user.id,
      action: "set_password",
      targetUserId: id,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
      metadata: { viaAdmin: true },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to set password";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
