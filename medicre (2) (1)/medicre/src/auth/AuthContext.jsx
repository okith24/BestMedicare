import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthCtx = createContext(null);

const LS_USERS = "bm_users_v1";
const LS_SESSION = "bm_session_v1";

// Staff rule (edit if you want stricter)
function getRoleFromEmail(email) {
  const e = (email || "").trim().toLowerCase();
  const local = e.split("@")[0] || "";
  const domain = e.split("@")[1] || "";
  if (domain === "nawala.com" && local.includes("staff")) return "staff";
  return "patient";
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json) ?? fallback;
  } catch {
    return fallback;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // {email, role, name}

  useEffect(() => {
    const session = safeParse(localStorage.getItem(LS_SESSION), null);
    if (session?.email && session?.role) setUser(session);
  }, []);

  const api = useMemo(() => {
    const readUsers = () => safeParse(localStorage.getItem(LS_USERS), []);

    const writeUsers = (arr) => localStorage.setItem(LS_USERS, JSON.stringify(arr));

    const signIn = ({ email, password }) => {
      const e = (email || "").trim().toLowerCase();
      const p = (password || "").trim();

      const users = readUsers();
      const found = users.find((u) => u.email === e);

      if (!found) throw new Error("Account not found. Please sign up first.");
      if (found.password !== p) throw new Error("Wrong password. Try again.");

      const session = { email: found.email, role: found.role, name: found.name || "" };
      localStorage.setItem(LS_SESSION, JSON.stringify(session));
      setUser(session);
      return session;
    };

    const signUp = ({ name, email, password }) => {
      const e = (email || "").trim().toLowerCase();
      const p = (password || "").trim();
      const n = (name || "").trim();

      if (!e || !p) throw new Error("Email and password are required.");
      if (p.length < 4) throw new Error("Password should be at least 4 characters.");

      const role = getRoleFromEmail(e);

      const users = readUsers();
      if (users.some((u) => u.email === e)) throw new Error("This email is already registered.");

      const newUser = { email: e, password: p, role, name: n };
      users.push(newUser);
      writeUsers(users);

      const session = { email: newUser.email, role: newUser.role, name: newUser.name || "" };
      localStorage.setItem(LS_SESSION, JSON.stringify(session));
      setUser(session);
      return session;
    };

    const signOut = () => {
      localStorage.removeItem(LS_SESSION);
      setUser(null);
    };

    return { user, signIn, signUp, signOut };
  }, [user]);

  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
