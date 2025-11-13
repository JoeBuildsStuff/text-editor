import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { AuthError } from "@/lib/auth/errors";
import {
  createSessionForUser,
  createUser,
  deleteSessionByToken,
  getSessionByToken,
  verifyUserCredentials,
} from "@/lib/auth/store";
import type { AuthSession, AuthUser } from "@/lib/auth/types";

const signUpSchema = z.object({
  name: z.string().min(1, "Name is required").max(64, "Name is too long"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

type RouteContext = {
  params: {
    all?: string[];
  };
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function setSessionCookie(response: NextResponse, token: string, session: AuthSession) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt),
  });
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function successResponse(user: AuthUser, session: AuthSession, token: string, status = 200) {
  const response = NextResponse.json(
    {
      user,
      session,
    },
    { status }
  );
  setSessionCookie(response, token, session);
  return response;
}

async function handleSignUp(request: NextRequest) {
  let payload: z.infer<typeof signUpSchema>;

  try {
    const body = await request.json();
    payload = signUpSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      return jsonError(issue?.message ?? "Invalid sign up payload", 400);
    }
    return jsonError("Invalid JSON payload", 400);
  }

  try {
    const user = createUser(payload);
    const { token, session } = createSessionForUser(user, true);
    return successResponse(user, session, token, 201);
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.status);
    }
    console.error("Failed to sign up user", error);
    return jsonError("Unable to create account", 500);
  }
}

async function handleSignIn(request: NextRequest) {
  let payload: z.infer<typeof signInSchema>;

  try {
    const body = await request.json();
    payload = signInSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      return jsonError(issue?.message ?? "Invalid sign in payload", 400);
    }
    return jsonError("Invalid JSON payload", 400);
  }

  const user = verifyUserCredentials({
    email: payload.email,
    password: payload.password,
  });

  if (!user) {
    return jsonError("Invalid email or password", 401);
  }

  const rememberMe = payload.rememberMe ?? true;
  const { token, session } = createSessionForUser(user, rememberMe);
  return successResponse(user, session, token);
}

async function handleSignOut(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    deleteSessionByToken(token);
  }
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
}

async function handleSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ session: null });
  }

  const session = getSessionByToken(token);
  if (!session) {
    const response = NextResponse.json({ session: null });
    clearSessionCookie(response);
    return response;
  }

  return NextResponse.json({ session });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const action = context.params.all?.[0];

  switch (action) {
    case "sign-up":
      return handleSignUp(request);
    case "sign-in":
      return handleSignIn(request);
    case "sign-out":
      return handleSignOut(request);
    default:
      return jsonError("Not Found", 404);
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const action = context.params.all?.[0];

  if (action === "session") {
    return handleSession(request);
  }

  return jsonError("Not Found", 404);
}
