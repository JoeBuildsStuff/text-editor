import { NextResponse } from "next/server";

import { deleteUserCascade, recordAdminAction } from "@/lib/auth/admin";
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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromHeaders(request.headers);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  const result = deleteUserCascade(id);
  recordAdminAction({
    actorUserId: session.user.id,
    action: "delete_user",
    targetUserId: id,
    ip: clientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    metadata: result,
  });
  return NextResponse.json({ result });
}
