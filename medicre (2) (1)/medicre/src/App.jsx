import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import NavBar from "./NavBar.jsx";
import Home from "./Home.jsx";
import Whyus from "./Whyus.jsx";
import Echanneling from "./Echanneling.jsx";
import Signin from "./Signin.jsx";
import Signup from "./Signup.jsx";

import StaffDashboard from "./StaffDashboard.jsx";
import PatientDashboard from "./PatientDashboard.jsx";

import { RequireRole, RequireAuth } from "./auth/ProtectedRoute.jsx";
import { useAuth } from "./auth/AuthContext.jsx";

function DashboardRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/signin" replace />;
  return user.role === "staff" ? (
    <Navigate to="/staff" replace />
  ) : (
    <Navigate to="/patient" replace />
  );
}

export default function App() {
  return (
    <>
      <div className="bg-glow" />
      <NavBar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/echanneling" element={<Echanneling />} />
        <Route path="/whyus" element={<Whyus />} />

        <Route path="/signin" element={<Signin />} />
        <Route path="/signup" element={<Signup />} />

        {/* role landing */}
        <Route path="/dashboard" element={<DashboardRedirect />} />

        {/* protected dashboards */}
        <Route
          path="/staff"
          element={
            <RequireRole role="staff">
              <StaffDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/patient"
          element={
            <RequireRole role="patient">
              <PatientDashboard />
            </RequireRole>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
