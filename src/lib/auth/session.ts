import { headers } from "next/headers";

import { auth } from "../auth";
import type { AuthSession } from "./types";

export async function getServerSession(): Promise<AuthSession | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    
    if (!session?.session || !session?.user) {
      return null;
    }

    // Convert better-auth session format to our AuthSession type
    return {
      sessionId: session.session.id,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        createdAt: session.user.createdAt.toISOString(),
      },
      expiresAt: session.session.expiresAt.toISOString(),
      rememberMe: session.session.expiresAt.getTime() > Date.now() + 24 * 60 * 60 * 1000, // If expires in more than 1 day, consider it "remember me"
    };
  } catch {
    return null;
  }
}

export async function getSessionFromHeaders(headers: Headers): Promise<AuthSession | null> {
  try {
    const session = await auth.api.getSession({
      headers,
    });
    
    if (!session?.session || !session?.user) {
      return null;
    }

    // Convert better-auth session format to our AuthSession type
    return {
      sessionId: session.session.id,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        createdAt: session.user.createdAt.toISOString(),
      },
      expiresAt: session.session.expiresAt.toISOString(),
      rememberMe: session.session.expiresAt.getTime() > Date.now() + 24 * 60 * 60 * 1000,
    };
  } catch {
    return null;
  }
}
