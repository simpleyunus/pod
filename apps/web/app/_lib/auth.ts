// Client-side session: JWT + user snapshot in localStorage.
// The API is the enforcement point; this only drives UI state.

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  email?: string | null;
  role: 'OWNER' | 'ADMIN' | 'CONSULTANT' | 'VIEWER';
}

const TOKEN_KEY = 'pod.token';
const USER_KEY = 'pod.user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Legacy key from the pre-auth "Acting as" pattern.
  localStorage.removeItem('actingAsUserId');
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

const ROLE_RANK: Record<SessionUser['role'], number> = {
  VIEWER: 0,
  CONSULTANT: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function hasRole(min: SessionUser['role'], user?: SessionUser | null): boolean {
  const u = user ?? getUser();
  if (!u) return false;
  return ROLE_RANK[u.role] >= ROLE_RANK[min];
}
