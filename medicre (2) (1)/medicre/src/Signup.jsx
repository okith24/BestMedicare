import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "./api.js";
import { useAuth } from "./auth/AuthContext.jsx";
import "./auth-glass.css";

const ease = [0.22, 1, 0.36, 1];

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const fromPath =
    typeof location.state?.from === "string" && location.state.from.startsWith("/")
      ? location.state.from
      : null;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [status, setStatus] = useState({ type: "idle", msg: "" });
  const [loading, setLoading] = useState(false);

  const navigateAfterAuth = () => {
    if (fromPath) {
      navigate(fromPath, { replace: true });
      return;
    }
    navigate("/patientdashboard", { replace: true });
  };

  const handleCreateAccount = async () => {
    if (!name || !email || !nationalId || !phone || !gender || !password) {
      setStatus({ type: "error", msg: "Please fill name, email, national ID, phone, gender, and password." });
      return;
    }

    const normalizedNationalId = nationalId.trim().toUpperCase();
    if (!/^(?:\d{12}|\d{9}V)$/.test(normalizedNationalId)) {
      setStatus({ type: "error", msg: "National ID must be 12 digits or 9 digits + V." });
      return;
    }

    if (!acceptTerms) {
      setStatus({ type: "error", msg: "Please accept Terms and Privacy." });
      return;
    }

    try {
      setLoading(true);
      setStatus({ type: "idle", msg: "" });
      const normalizedEmail = email.trim().toLowerCase();
      const result = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          name,
          email: normalizedEmail,
          nationalId: normalizedNationalId,
          phone,
          gender,
          password
        })
      });

      if (!result?.user || !result?.token) {
        throw new Error("Account created but login session was not started.");
      }

      login(result.user, result.token);
      navigateAfterAuth();
    } catch (error) {
      setStatus({ type: "error", msg: error.message || "Failed to create account." });
    } finally {
      setLoading(false);
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
              <div className="authTag">Patient-first care - Trusted team</div>
            </div>
          </div>

          <div className="authBigTitle">
            <>
              Create your <span className="authAccent">MediCare</span> account
            </>
          </div>

          <div className="authBullets">
            <div className="authBullet"><span className="authDot" /> Quick booking</div>
            <div className="authBullet"><span className="authDot" /> Secure access</div>
            <div className="authBullet"><span className="authDot" /> SMS notifications</div>
          </div>
        </motion.div>

        <motion.div
          className="glass authForm"
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, ease, delay: 0.08 }}
        >
          <h2 className="authH">Sign Up</h2>
          <p className="authP">
            Create a patient account to access your patient dashboard.
          </p>

          <div className="authFields">
            <input className="authInput" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="authInput" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input
              className="authInput"
              placeholder="National ID (12 digits or 9 digits + V)"
              value={nationalId}
              maxLength={12}
              onChange={(e) =>
                setNationalId(e.target.value.toUpperCase().replace(/[^0-9V]/g, "").slice(0, 12))
              }
            />
            <input className="authInput" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <select className="authInput" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <input className="authInput" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <p className="authP" style={{ marginTop: 8 }}>
            Use at least 8 characters with uppercase, lowercase, number, and symbol.
          </p>

          <div className="authRow">
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
              I agree to Terms and Privacy
            </label>
          </div>

          {status.type !== "idle" ? (
            <div className={status.type === "error" ? "echAlert bad" : "echAlert ok"} style={{ marginTop: 12 }}>
              {status.msg}
            </div>
          ) : null}

          <div className="authBtnRow">
            <button className="btnPrimary" onClick={handleCreateAccount} disabled={loading}>
              {loading ? "Creating..." : "Create Account"}
            </button>
            <button className="btnGhost" onClick={() => navigate("/")}>Back to Home</button>
          </div>

          <div className="authMini">
            Already have an account?{" "}
            <Link className="authLink" to="/signin" state={{ from: fromPath }}>
              Sign in
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
