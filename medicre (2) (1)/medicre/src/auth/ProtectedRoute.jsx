import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/signin" replace />;
  return children;
}

export function RequireRole({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/signin" replace />;
  if (user.role !== role) return <Navigate to="/dashboard" replace />;
  return children;
}
