import React, { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import "./nav.css";

export default function NavBar() {
  // ✅ Only these 3 texts will animate
  const subtitles = useMemo(
    () => ["Trusted Care 💙", "Modern Tech ⚡", "24/7 Support 🫶"],
    []
  );

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setIdx((p) => (p + 1) % subtitles.length);
    }, 2200); // timer speed (ms)
    return () => clearInterval(t);
  }, [subtitles.length]);

  return (
    <header className="nb-wrap">
      <motion.div
        className="container nb"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
      >
        {/* LEFT: Logo + Name */}
        <NavLink to="/" className="nb-brand">
          <div className="nb-logoImg">
            <img src="/images/logo.png" alt="Best Medicare Logo" />
          </div>

          <div className="nb-brandText">
            <div className="nb-title">BEST MEDICARE</div>

            {/* ✅ Animated subtitle (only this part moves) */}
            <div className="nb-subtitle nb-subtitleWrap">
              <AnimatePresence mode="wait">
                <motion.span
                  key={idx}
                  className="nb-subtitleAnim"
                  initial={{ opacity: 0, y: 10, scale: 0.98, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, scale: 0.98, filter: "blur(6px)" }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  {subtitles[idx]}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>
        </NavLink>

        {/* CENTER: Links */}
        <nav className="nb-links">
          <NavLink to="/" className={({ isActive }) => (isActive ? "nb-link active" : "nb-link")}>
            Home
          </NavLink>

          <NavLink
            to="/echanneling"
            className={({ isActive }) => (isActive ? "nb-link active" : "nb-link")}
          >
            E-channelling
          </NavLink>

          <NavLink to="/whyus" className={({ isActive }) => (isActive ? "nb-link active" : "nb-link")}>
            Why Us
          </NavLink>
        </nav>

        {/* RIGHT: Actions */}
        <div className="nb-actions">
          <NavLink to="/signin" className="nb-btn nb-btnGhost">
            Sign in
          </NavLink>

          <NavLink to="/signup" className="nb-btn nb-btnPrimary">
            Sign up
          </NavLink>
        </div>
      </motion.div>
    </header>
  );
}
