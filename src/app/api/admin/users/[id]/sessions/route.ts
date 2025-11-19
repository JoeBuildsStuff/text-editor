import { NextResponse } from "next/server";

import { deleteSessionsForUser } from "@/lib/auth/admin";
import { getSessionFromHeaders } from "@/lib/auth/session";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromHeaders(request.headers);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();

  let body: { sessionId?: string } = {};
  try {
    body = (await request.json()) as { sessionId?: string };
  } catch {
    // allow empty body
  }

  const deleted = deleteSessionsForUser(params.id, body.sessionId);
  return NextResponse.json({ deleted });
}
