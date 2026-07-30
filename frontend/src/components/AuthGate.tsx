"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SESSION_KEY = "waip_session";
const SESSION_EMAIL_KEY = "waip_session_email";
const SESSION_ROLE_KEY = "waip_session_role";
const SESSION_TOKEN_KEY = "waip_session_token";

export function isSignedIn(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

export function currentUserEmail(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SESSION_EMAIL_KEY);
}

export function currentUserRole(): "admin" | "viewer" | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SESSION_ROLE_KEY) as "admin" | "viewer" | null;
}

export function isAdmin(): boolean {
  return currentUserRole() === "admin";
}

export function authToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SESSION_TOKEN_KEY);
}

export function signIn(email: string, role: string, token: string) {
  sessionStorage.setItem(SESSION_KEY, "1");
  sessionStorage.setItem(SESSION_EMAIL_KEY, email);
  sessionStorage.setItem(SESSION_ROLE_KEY, role);
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function signOut() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_EMAIL_KEY);
  sessionStorage.removeItem(SESSION_ROLE_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

/**
 * Client-side redirect gate PLUS the real backend enforcement: every API call
 * (see lib/api.ts) sends this token as a Bearer header, and the backend
 * (app/core/security.py) rejects any request without a valid one. Previously
 * this was sessionStorage-only with zero server-side check.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isSignedIn() || !authToken()) {
      router.replace("/login");
      return;
    }
    setChecked(true);
  }, [router]);

  if (!checked) {
    return <div className="min-h-screen bg-[#05040d]" />;
  }

  return <>{children}</>;
}
