import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api.js";

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = localStorage.getItem("bmn_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readStoredToken() {
  try {
    return localStorage.getItem("bmn_auth_token") || "";
  } catch {
    return "";
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser());
  const [token, setToken] = useState(() => readStoredToken());

  const clearLocalSession = useCallback(() => {
    setUser(null);
    setToken("");
    localStorage.removeItem("bmn_user");
    localStorage.removeItem("bmn_auth_token");
  }, []);

  const login = useCallback((nextUser, nextToken = "") => {
    setUser(nextUser);
    localStorage.setItem("bmn_user", JSON.stringify(nextUser));
    setToken(nextToken);
    if (nextToken) {
      localStorage.setItem("bmn_auth_token", nextToken);
    } else {
      localStorage.removeItem("bmn_auth_token");
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await apiFetch("/api/auth/logout", { method: "POST" });
      }
    } catch {
      // Ignore logout API failure and clear local session anyway.
    }
    clearLocalSession();
  }, [clearLocalSession, token]);

  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      if (!token) {
        clearLocalSession();
        return;
      }

      try {
        const payload = await apiFetch("/api/auth/me");
        if (cancelled) return;
        if (payload?.user) {
          setUser(payload.user);
          localStorage.setItem("bmn_user", JSON.stringify(payload.user));
          return;
        }
        clearLocalSession();
      } catch {
        if (!cancelled) {
          clearLocalSession();
        }
      }
    };

    verifySession();
    return () => {
      cancelled = true;
    };
  }, [clearLocalSession, token]);

  const value = useMemo(() => ({ user, token, login, logout }), [login, logout, token, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
