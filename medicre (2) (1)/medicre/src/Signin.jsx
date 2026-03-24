import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import VideoBG from "./components/VideoBG.jsx";
import videoSrc from "./assets/hospital.mp4";
import staffImg from "./assets/docter.png";
import "./auth-glass.css";

export default function Signin() {
  const { signIn } = useAuth();
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const onSubmit = (e) => {
    e.preventDefault();
    setMsg("");

    try {
      const session = signIn({ email, password });
      nav(session.role === "staff" ? "/staff" : "/patient");
    } catch (err) {
      setMsg(err.message || "Login failed");
    }
  };

  return (
    <VideoBG src={videoSrc}>
      <div className="authShell">
        {/* LEFT INTRO */}
        <div className="authIntro">
          <div className="authIntroTop">
            <span className="authIntroBadge">💙 BEST MEDICARE • NAWALA</span>
          </div>

          <h1 className="authIntroH">Welcome Back 👋</h1>
          <p className="authIntroP">
            Sign in to manage appointments, patient records, and hospital services with a smooth,
            secure experience.
          </p>

          <div className="authPills">
            <span className="authPill">🕒 24/7 Support</span>
            <span className="authPill">🩺 Trusted Doctors</span>
            <span className="authPill">⚡ Fast E-channelling</span>
            <span className="authPill">🧾 Clear Reports</span>
          </div>

          <div className="authStaffCard">
            <img className="authStaffImg" src={staffImg} alt="Staff" />
            <div>
              <p className="authStaffName">Hospital Director</p>
              <p className="authStaffRole">Medical Services • Best Medicare</p>
              <p className="authStaffQuote">
                “We treat every patient like family — accurate diagnosis, honest guidance, and
                caring follow-ups.” 💜
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT FORM */}
        <div className="authCard authFormCard">
          <h2 className="authTitle">Sign in</h2>
          <p className="authSub">Staff → @nawala.com + contains “staff” ✅</p>

          <form onSubmit={onSubmit} className="authForm">
            <label>Email</label>
            <input
              className="authInput"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
            />

            <label>Password</label>
            <input
              className="authInput"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="password"
            />

            {msg && <div className="authMsg">{msg}</div>}

            <button className="authBtn" type="submit">
              Login
            </button>
          </form>

          <div className="authFoot">
            New user? <Link to="/signup">Create account</Link>
          </div>
        </div>
      </div>
    </VideoBG>
  );
}
