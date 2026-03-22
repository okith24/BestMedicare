import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "./api.js";
import { useAuth } from "./auth/AuthContext.jsx";
import "./auth-glass.css";

const ease = [0.22, 1, 0.36, 1];
const SIGNUP_VERIFY_STORAGE_KEY = "bmn_signup_verify";

function readStoredVerificationState() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(SIGNUP_VERIFY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.signupId || !parsed?.signupToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearStoredVerificationState() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SIGNUP_VERIFY_STORAGE_KEY);
}

function persistVerificationState(state) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SIGNUP_VERIFY_STORAGE_KEY, JSON.stringify(state));
}

export default function SignupVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const initialState = useMemo(() => {
    const routeState =
      location.state && typeof location.state === "object"
        ? location.state
        : null;

    if (routeState?.signupId && routeState?.signupToken) {
      persistVerificationState(routeState);
      return routeState;
    }

    return readStoredVerificationState();
  }, [location.state]);

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(() =>
    initialState?.message
      ? { type: "ok", msg: initialState.message }
      : { type: "idle", msg: "" }
  );
  const [verificationState, setVerificationState] = useState(initialState);

  const fromPath =
    typeof verificationState?.fromPath === "string" &&
    verificationState.fromPath.startsWith("/")
      ? verificationState.fromPath
      : null;

  const navigateAfterAuth = () => {
    clearStoredVerificationState();

    if (fromPath) {
      navigate(fromPath, { replace: true });
      return;
    }

    navigate("/patientdashboard", { replace: true });
  };

  const handleVerifyOtp = async () => {
    if (!verificationState?.signupId || !verificationState?.signupToken) {
      setStatus({ type: "error", msg: "Start signup again to verify your phone number." });
      return;
    }

    if (!/^\d{6}$/.test(otp.trim())) {
      setStatus({ type: "error", msg: "Enter the 6-digit OTP sent to your phone." });
      return;
    }

    try {
      setLoading(true);
      setStatus({ type: "idle", msg: "" });

      const result = await apiFetch("/api/auth/signup/verify", {
        method: "POST",
        body: JSON.stringify({
          signupId: verificationState.signupId,
          signupToken: verificationState.signupToken,
          otp: otp.trim()
        })
      });

      if (!result?.user || !result?.token) {
        throw new Error("Phone verified but login session was not started.");
      }

      login(result.user, result.token);
      navigateAfterAuth();
    } catch (error) {
      setStatus({ type: "error", msg: error.message || "OTP verification failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!verificationState?.signupId || !verificationState?.signupToken) {
      setStatus({ type: "error", msg: "Start signup again to receive a new OTP." });
      return;
    }

    try {
      setLoading(true);
      setStatus({ type: "idle", msg: "" });

      const result = await apiFetch("/api/auth/signup/resend", {
        method: "POST",
        body: JSON.stringify({
          signupId: verificationState.signupId,
          signupToken: verificationState.signupToken
        })
      });

      const nextState = {
        ...verificationState,
        signupId: result?.signupId || verificationState.signupId,
        signupToken: result?.signupToken || verificationState.signupToken,
        phone: result?.phone || verificationState.phone,
        message: result?.message || "A new OTP has been sent to your phone."
      };

      setVerificationState(nextState);
      persistVerificationState(nextState);
      setStatus({ type: "ok", msg: nextState.message });
    } catch (error) {
      setStatus({ type: "error", msg: error.message || "Unable to resend OTP right now." });
    } finally {
      setLoading(false);
    }
  };

  const handleStartAgain = () => {
    clearStoredVerificationState();
    navigate("/signup", { replace: true });
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
              <div className="authTag">Mobile verification - Patient signup</div>
            </div>
          </div>

          <div className="authBigTitle">
            Verify your <span className="authAccent">phone</span> number
          </div>

          <div className="authBullets">
            <div className="authBullet"><span className="authDot" /> OTP security</div>
            <div className="authBullet"><span className="authDot" /> SMS verification</div>
            <div className="authBullet"><span className="authDot" /> Account activation</div>
          </div>
        </motion.div>

        <motion.div
          className="glass authForm"
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, ease, delay: 0.08 }}
        >
          <h2 className="authH">Verify OTP</h2>
          <p className="authP">
            {verificationState?.phone
              ? `Enter the 6-digit code sent to ${verificationState.phone}.`
              : "Enter the 6-digit code sent to your phone to complete registration."}
          </p>

          {!verificationState ? (
            <>
              <div className="echAlert bad" style={{ marginTop: 12 }}>
                No pending signup verification was found. Please create your account again.
              </div>
              <div className="authBtnRow">
                <button className="btnPrimary" onClick={handleStartAgain}>
                  Go To Sign Up
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="authFields">
                <input
                  className="authInput"
                  value={verificationState.phone || ""}
                  readOnly
                />
                <input
                  className="authInput"
                  placeholder="Enter 6-digit OTP"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>

              <p className="authP" style={{ marginTop: 8 }}>
                After successful verification, your account will be activated and you will receive the registration success SMS.
              </p>

              {status.type !== "idle" ? (
                <div className={status.type === "error" ? "echAlert bad" : "echAlert ok"} style={{ marginTop: 12 }}>
                  {status.msg}
                </div>
              ) : null}

              <div className="authBtnRow">
                <button className="btnPrimary" onClick={handleVerifyOtp} disabled={loading}>
                  {loading ? "Verifying..." : "Finalize Registration"}
                </button>
                <button className="btnGhost" onClick={handleStartAgain} disabled={loading}>
                  Start Again
                </button>
              </div>

              <div className="authMini">
                Didn&apos;t receive the OTP?{" "}
                <button
                  type="button"
                  className="authLink"
                  onClick={handleResendOtp}
                  disabled={loading}
                  style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
                >
                  Resend code
                </button>
              </div>
            </>
          )}

          <div className="authMini">
            Already have an account?{" "}
            <Link className="authLink" to="/signin" state={{ from: fromPath, email: verificationState?.email || "" }}>
              Sign in
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
