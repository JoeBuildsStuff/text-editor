import { NextResponse } from "next/server";

import { getSessionFromHeaders } from "@/lib/auth/session";

export async function GET(request: Request) {
  const session = await getSessionFromHeaders(request.headers);
  
  if (!session) {
    return NextResponse.json({ session: null }, { status: 200 });
  }
  
  return NextResponse.json({ session });
}

