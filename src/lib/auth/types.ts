export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  isAdmin: boolean;
};

export type AuthSession = {
  sessionId: string;
  user: AuthUser;
  expiresAt: string;
  rememberMe: boolean;
};

export type CreatedSession = {
  token: string;
  session: AuthSession;
};
