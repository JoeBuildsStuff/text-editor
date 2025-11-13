import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "./constants";
import { getSessionByToken } from "./store";
import type { AuthSession } from "./types";

function parseCookieHeader(cookieHeader: string): Record<string, string> {
  return cookieHeader.split(/;\s*/).reduce<Record<string, string>>((acc, part) => {
    if (!part) {
      return acc;
    }
    const [name, ...rest] = part.split("=");
    if (!name) {
      return acc;
    }
    const value = rest.join("=");
    let key = name.trim();
    try {
      key = decodeURIComponent(key);
    } catch {
      // noop
    }
    try {
      acc[key] = decodeURIComponent(value ?? "");
    } catch {
      acc[key] = value ?? "";
    }
    return acc;
  }, {});
}

export function getServerSession(): AuthSession | null {
  const store = cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return getSessionByToken(token);
}

export function getSessionFromHeaders(headers: Headers): AuthSession | null {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }
  const parsed = parseCookieHeader(cookieHeader);
  const token = parsed[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }
  return getSessionByToken(token);
}
