import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";

import NavBar from "./NavBar.jsx";
import Home from "./Home.jsx";
import Whyus from "./Whyus.jsx";
import Echanneling from "./Echanneling.jsx";
import Signin from "./Signin.jsx";
import Signup from "./Signup.jsx";
import SignupVerify from "./SignupVerify.jsx";
import ForgotPassword from "./ForgotPassword.jsx";
import Dashboard from "./Dashboard.jsx";
import Invoice from "./Invoice.jsx";
import PatientDashboard from "./PatientDashboard.jsx";
import ManageStaff from "./ManageStaff.jsx";
import AddStaff from "./AddStaff.jsx";
import StaffReports from "./StaffReports.jsx";
import ChatbotControlRoom from "./ChatbotControlRoom.jsx";
import ChatbotLauncher from "./ChatbotLauncher.jsx";

// Reusable guard for routes that only specific roles can open.
function RequireRole({ roles, children }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/signin" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}

// Reusable guard for routes that only need a signed-in user.
function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return (
      <Navigate
        to="/signin"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return children;
}

// Main route tree for public, patient, staff, and superadmin views.
export default function App() {
  // Decides which shared layout pieces show for each route.
  const location = useLocation();
  const { user } = useAuth();

  // Hide navbar on superadmin pages
  const hideNavbar = location.pathname.startsWith("/superadmin");

  return (
    <>
      <div className="bg-glow" />
      {!hideNavbar && <NavBar />}
      {/* Keep the chatbot available on most signed-in pages except the staff dashboard. */}
      {user && (!hideNavbar || user.role === "superadmin") && location.pathname !== "/staffdashboard" && (
        <ChatbotLauncher />
      )}

      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />
        <Route path="/signin" element={<Signin />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/signup/verify" element={<SignupVerify />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route
          path="/chatbot-control"
          element={
            <RequireAuth>
              {/* Any signed-in user can open the chatbot page; role-based controls are handled inside it. */}
              <ChatbotControlRoom />
            </RequireAuth>
          }
        />

        {/* Auth Required Routes */}
        <Route
          path="/echanneling"
          element={
            <RequireAuth>
              <Echanneling />
            </RequireAuth>
          }
        />

        <Route
          path="/whyus"
          element={<Whyus />}
        />

        {/* Staff Routes (doctor, nurse, staff allowed) */}
        <Route
          path="/staffdashboard"
          element={
            <RequireRole roles={["staff", "doctor", "nurse"]}>
              <Dashboard />
            </RequireRole>
          }
        />

        <Route
          path="/invoice"
          element={
            <RequireRole roles={["staff", "doctor", "nurse"]}>
              <Invoice />
            </RequireRole>
          }
        />

        <Route
          path="/staff/reports"
          element={
            <RequireRole roles={["staff", "doctor", "nurse"]}>
              <StaffReports />
            </RequireRole>
          }
        />

        {/* Patient Route */}
        <Route
          path="/patientdashboard"
          element={
            <RequireRole roles={["patient"]}>
              <PatientDashboard />
            </RequireRole>
          }
        />

        {/* Super Admin Routes */}
        <Route
          path="/superadmin/managestaff"
          element={
            <RequireRole roles={["superadmin"]}>
              <ManageStaff />
            </RequireRole>
          }
        />

        <Route
          path="/superadmin/add-staff"
          element={
            <RequireRole roles={["superadmin"]}>
              <AddStaff />
            </RequireRole>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}







