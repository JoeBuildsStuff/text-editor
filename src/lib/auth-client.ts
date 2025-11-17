"use client";

import { createAuthClient } from "better-auth/react";

// Use runtime URL instead of build-time env var
// Empty string means use the current origin (same domain)
// This works in both dev (localhost) and production (deployed domain)
const getBaseURL = () => {
  // In browser, use current origin (works for both dev and prod)
  if (typeof window !== "undefined") {
    return "";
  }
  // Fallback for SSR (shouldn't happen with better-auth/react, but just in case)
  return process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});
