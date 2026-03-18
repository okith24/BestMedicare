import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import { apiFetch } from "./api.js";
import "./auth-glass.css";

const ease = [0.22, 1, 0.36, 1];

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const fromPath =
    typeof location.state?.from === "string" &&
    location.state.from.startsWith("/")
      ? location.state.from
      : null;

  const [email, setEmail] = useState(
    typeof location.state?.email === "string" ? location.state.email : ""
  );

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const navigateAfterAuth = (fallbackPath) => {
    if (fromPath) {
      navigate(fromPath, { replace: true });
      return;
    }
    navigate(fallbackPath, { replace: true });
  };

  const handleSignIn = async () => {
    if (loading) return;

    if (!email.trim() || !password) {
      alert("Please enter email and password");
      return;
    }

    try {
      setLoading(true);

      const result = await apiFetch("/api/auth/signin", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password
        }),
      });

      login(result.user, result.token || "");

      /* ROLE BASED REDIRECT */
      const role = result.user?.role;

      if (role === "superadmin") {
        navigateAfterAuth("/superadmin/managestaff");
      } 
      else if (role && role !== "patient") {
        navigateAfterAuth("/staffdashboard");
      } 
      else {
        navigateAfterAuth("/patientdashboard");
      }

    } catch (error) {
      console.error(error);
      alert(error?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSignIn();
    }
  };

  return (
    <div className="authWrap">
      <video className="authVideo" autoPlay muted loop playsInline>
        <source src="/videos/hospital.mp4" type="video/mp4" />
      </video>

      <div className="authOverlay" />
      <div className="authNoise" />

      <motion.div
        className="glass authCard"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.65, ease }}
      >
        <motion.div
          className="glass authBrand"
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, ease, delay: 0.05 }}
        >
          <div className="authLogoRow">
            <div className="authLogo">
              <img src="/images/logo.png" alt="Hospital Logo" />
            </div>

            <div>
              <div className="authHospitalName">BEST MEDICARE</div>
              <div className="authTag">
                Trusted Care - Modern Facilities
              </div>
            </div>
          </div>

          <div className="authBigTitle">
            Access your <span className="authAccent">MediCare</span> dashboard
          </div>

          <div className="authBullets">
            <div className="authBullet">
              <span className="authDot" /> Appointment Management
            </div>

            <div className="authBullet">
              <span className="authDot" /> Reports and Records
            </div>

            <div className="authBullet">
              <span className="authDot" /> Secure Access
            </div>
          </div>
        </motion.div>

        <motion.div
          className="glass authForm"
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, ease, delay: 0.08 }}
        >
          <h2 className="authH">Sign In</h2>

          <p className="authP">
            Sign in using your staff or patient account.
          </p>

          <div className="authFields">
            <input
              className="authInput"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyPress}
            />

            <input
              className="authInput"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyPress}
            />
          </div>

          <div className="authRow">
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" />
              Remember me
            </label>

            <Link className="authLink" to="/forgot-password">
              Forgot password?
            </Link>
          </div>

          <div className="authBtnRow">
            <button
              className="btnPrimary"
              onClick={handleSignIn}
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </div>

          <div className="authMini">
            Need an account?{" "}
            <Link
              className="authLink"
              to="/signup"
              state={{ from: fromPath }}
            >
              Sign up
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
