import { NextResponse } from "next/server";

import { listAdminActions } from "@/lib/auth/admin";
import { getSessionFromHeaders } from "@/lib/auth/session";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function toInt(value: string | null, fallback: number, max?: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  if (max !== undefined) return Math.min(parsed, max);
  return parsed;
}

export async function GET(request: Request) {
  const session = await getSessionFromHeaders(request.headers);
  if (!session) return unauthorized();
  if (!session.user.isAdmin) return forbidden();

  const { searchParams } = new URL(request.url);
  const limit = toInt(searchParams.get("limit"), 50, 200);
  const offset = toInt(searchParams.get("offset"), 0);

  const actions = listAdminActions(limit, offset);
  return NextResponse.json({ actions });
}

