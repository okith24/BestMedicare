import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import VideoBG from "./components/VideoBG.jsx";
import videoSrc from "./assets/hospital.mp4";
import staffImg from "./assets/docter.png";
import "./auth-glass.css";

export default function Signup() {
  const { signUp } = useAuth();
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const onSubmit = (e) => {
    e.preventDefault();
    setMsg("");

    try {
      const session = signUp({ name, email, password });
      nav(session.role === "staff" ? "/staff" : "/patient");
    } catch (err) {
      setMsg(err.message || "Signup failed");
    }
  };

  return (
    <VideoBG src={videoSrc}>
      <div className="authShell">
        {/* LEFT INTRO */}
        <div className="authIntro">
          <div className="authIntroTop">
            <span className="authIntroBadge">✨ Create your account</span>
          </div>

          <h1 className="authIntroH">Join Best Medicare 💜</h1>
          <p className="authIntroP">
            Patients can sign up with any email. Staff members must use the official hospital staff
            email format.
          </p>

          <div className="authPills">
            <span className="authPill">✅ Easy Booking</span>
            <span className="authPill">📍 Nawala Junction</span>
            <span className="authPill">🧑‍⚕️ Specialist Team</span>
            <span className="authPill">🧠 Mental Wellness</span>
          </div>

          <div className="authStaffCard">
            <img className="authStaffImg" src={staffImg} alt="Best Medicare" />
            <div>
              <p className="authStaffName">Staff Email Tip</p>
              <p className="authStaffRole">Example format</p>
              <p className="authStaffQuote">
                Staff email: <b>bestmedicare.staff@nawala.com</b> ✅ <br />
                Patients: any email like <b>kasun@gmail.com</b> ✅
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT FORM */}
        <div className="authCard authFormCard">
          <h2 className="authTitle">Sign up</h2>
          <p className="authSub">Staff example → bestmedicare.staff@nawala.com</p>

          <form onSubmit={onSubmit} className="authForm">
            <label>Name (optional)</label>
            <input
              className="authInput"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="name"
            />

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
              Create account
            </button>
          </form>

          <div className="authFoot">
            Already have account? <Link to="/signin">Sign in</Link>
          </div>
        </div>
      </div>
    </VideoBG>
  );
}
