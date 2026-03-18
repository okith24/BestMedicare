import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { apiFetch } from "./api.js";
import "./auth-glass.css";

const ease = [0.22, 1, 0.36, 1];

export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [resetId, setResetId] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [step, setStep] = useState("request");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "idle", msg: "" });

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const rid = String(params.get("rid") || "").trim();
    const rt = String(params.get("rt") || "").trim();

    if (rid && rt) {
      setResetId(rid);
      setResetToken(rt);
      setStep("reset");
      setStatus({
        type: "success",
        msg: "Reset link opened. Enter your 6-digit code and new password."
      });
    }
  }, [location.search]);

  const requestCode = async () => {
    if (loading) return;
    if (!phone.trim()) {
      setStatus({ type: "error", msg: "Please enter your phone number." });
      return;
    }

    try {
      setLoading(true);
      const payload = await apiFetch("/api/auth/forgot-password/request", {
        method: "POST",
        body: JSON.stringify({ phone: phone.trim() })
      });

      setStatus({
        type: "success",
        msg: payload?.message || "SMS reset link sent. Open it and enter the 6-digit code."
      });
    } catch (err) {
      setStatus({ type: "error", msg: err?.message || "Failed to send reset SMS link." });
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (loading) return;
    if (!resetId || !resetToken) {
      setStatus({ type: "error", msg: "Invalid reset link. Please request a new SMS reset link." });
      return;
    }
    if (!otp.trim() || !newPassword || !confirmPassword) {
      setStatus({ type: "error", msg: "Please enter OTP and new password." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", msg: "Password confirmation does not match." });
      return;
    }

    try {
      setLoading(true);
      await apiFetch("/api/auth/forgot-password/reset", {
        method: "POST",
        body: JSON.stringify({
          resetId,
          resetToken,
          otp: otp.trim(),
          newPassword
        })
      });

      navigate("/signin", { replace: true });
    } catch (err) {
      setStatus({ type: "error", msg: err?.message || "Password reset failed." });
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
              <div className="authTag">SMS Password Recovery</div>
            </div>
          </div>

          <div className="authBigTitle">
            Reset your <span className="authAccent">password</span> safely
          </div>

          <div className="authBullets">
            <div className="authBullet">
              <span className="authDot" /> SMS reset link
            </div>
            <div className="authBullet">
              <span className="authDot" /> 6-digit verification code
            </div>
          </div>
        </motion.div>

        <motion.div
          className="glass authForm"
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, ease, delay: 0.08 }}
        >
          <h2 className="authH">Forgot Password</h2>
          <p className="authP">
            {step === "request"
              ? "Enter your phone number to receive an SMS reset link."
              : "Enter your 6-digit code and set your new password."}
          </p>

          <div className="authFields">
            {step === "request" ? (
              <input
                className="authInput"
                type="tel"
                placeholder="Phone (e.g. 9477xxxxxxx)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            ) : (
              <>
                <input
                  className="authInput"
                  placeholder="6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
                <input
                  className="authInput"
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <input
                  className="authInput"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </>
            )}
          </div>

          {status.type !== "idle" && (
            <div
              style={{
                marginTop: 12,
                fontWeight: 700,
                color: status.type === "success" ? "#12743d" : "#a33a3a"
              }}
            >
              {status.msg}
            </div>
          )}

          <div className="authBtnRow">
            {step === "request" ? (
              <button className="btnPrimary" onClick={requestCode} disabled={loading}>
                {loading ? "Sending..." : "Send SMS Link"}
              </button>
            ) : (
              <button className="btnPrimary" onClick={resetPassword} disabled={loading}>
                {loading ? "Resetting..." : "Reset Password"}
              </button>
            )}
          </div>

          <div className="authMini">
            Back to <Link className="authLink" to="/signin">Sign in</Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
