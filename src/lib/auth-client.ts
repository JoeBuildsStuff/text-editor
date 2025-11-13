"use client";

import { useCallback, useEffect, useState } from "react";

import type { AuthSession, AuthUser } from "@/lib/auth/types";

type SignUpPayload = {
  name: string;
  email: string;
  password: string;
};

type SignInPayload = {
  email: string;
  password: string;
  rememberMe?: boolean;
};

type AuthResponse = {
  user: AuthUser;
  session: AuthSession;
};

type SessionResponse = {
  session: AuthSession | null;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const data = (await response.json().catch(() => ({}))) as unknown as T & {
    error?: string;
  };

  if (!response.ok) {
    const message = typeof (data as { error?: string }).error === "string"
      ? (data as { error?: string }).error
      : "Request failed";
    throw new Error(message);
  }

  return data as T;
}

async function signUpEmail(payload: SignUpPayload): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/sign-up", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function signInEmail(payload: SignInPayload): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/sign-in", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function signOutRequest(): Promise<void> {
  await request<{ success: boolean }>("/api/auth/sign-out", {
    method: "POST",
  });
}

async function getSessionRequest(): Promise<SessionResponse> {
  return request<SessionResponse>("/api/auth/session", {
    method: "GET",
  });
}

type UseSessionState = {
  data: AuthSession | null;
  error: Error | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
};

function useSession(): UseSessionState {
  const [data, setData] = useState<AuthSession | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const { session } = await getSessionRequest();
      setData(session ?? null);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error : new Error("Failed to load session"));
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return {
    data,
    error,
    isLoading,
    refetch: fetchSession,
  };
}

export const authClient = {
  signUp: {
    email: signUpEmail,
  },
  signIn: {
    email: signInEmail,
  },
  signOut: signOutRequest,
  getSession: getSessionRequest,
  useSession,
};
