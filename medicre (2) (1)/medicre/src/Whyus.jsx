import React, { useMemo } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import "./whyus.css";

const ease = [0.22, 1, 0.36, 1];

function SplitWords({ text, delay = 0 }) {
  const reduce = useReducedMotion();
  const words = useMemo(() => text.split(" "), [text]);

  if (reduce) return <span>{text}</span>;

  return (
    <span className="splitWrap" aria-label={text}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          className="splitWord"
          initial={{ y: 18, opacity: 0, filter: "blur(7px)" }}
          whileInView={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          viewport={{ once: true, amount: 0.7 }}
          transition={{ duration: 0.55, delay: delay + i * 0.045, ease }}
        >
          {w}&nbsp;
        </motion.span>
      ))}
    </span>
  );
}

const fadeUp = (d = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0, transition: { duration: 0.6, delay: d, ease } },
  viewport: { once: true, amount: 0.25 },
});

const pop = (d = 0) => ({
  initial: { opacity: 0, scale: 0.97, y: 14 },
  whileInView: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 240, damping: 18, delay: d },
  },
  viewport: { once: true, amount: 0.25 },
});

export default function Whyus() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const goToProtected = (path) => {
    if (user) {
      navigate(path);
      return;
    }
    navigate("/signup", { state: { from: path } });
  };

  // Smooth “floating” effect while user scrolls
  const { scrollYProgress } = useScroll();
  const floatY = useTransform(scrollYProgress, [0, 1], [0, -30]);

  // Customize these texts only
  const owner = {
    name: "Dr. Asanka Weerasinghe",
    role: "Hospital Director • Medical Services",
    msg:
      "I recommend our hospital because we treat every patient like family. " +
      "We focus on accurate diagnosis, honest guidance, transparent treatment plans, " +
      "and careful follow-up until you recover. Our team uses modern technology and " +
      "patient-first care to make sure you feel safe, respected, and supported at every step.",
    photo: "/images/owner-doctor.png",
  };

  // Put your real award photos in /public/images (replace anytime)
  const awards = [
    {
      year: "2025",
      title: "Fashion Formula 2025",
      img: "/images/award-01.jpeg",
    },
    {
      year: "2025",
      title: "Miss Teen Sri Lanka 2025",
      img: "/images/award-02.jpeg",
    },
    {
      year: "2025",
      title: "People Excellence's Award 2025",
      img: "/images/award-03.jpeg",
    },
    {
      year: "2025",
      title: "Miss Earth Sri Lanka 2025",
      img: "/images/award-04.jpeg",
    },
  ];

  const reasons = [
    { title: "Patient-First Care", text: "We listen, explain clearly, and treat with empathy. Your comfort matters." },
    { title: "Modern Technology", text: "Updated diagnostics and equipment for safer, faster clinical decisions." },
    { title: "Specialist Team", text: "Experienced consultants + trained nurses working together for you." },
  ];

  const comments = [
    { name: "Nimali K.", text: "Fast service. The doctor explained everything clearly. Highly recommended!" },
    { name: "Chamith S.", text: "Clean place. Friendly staff. Appointment was smooth and quick." },
    { name: "Tharindu P.", text: "Great care. They treated my family like their own." },
  ];

  return (
    <div className="page">
      <section className="wyNeo-hero">
        <div className="container wyNeo-grid">
          {/* LEFT */}
          <div>
            <motion.div {...fadeUp(0)} className="kicker">
              <span className="dot" /> Trusted Care • Modern Facilities • Expert Team
            </motion.div>

            <h1 className="h1 wyNeo-title">
              <SplitWords text="Why Patients Choose" delay={0.08} />
              <br />
              <span className="accent">
                <SplitWords text="Our Hospital" delay={0.20} />
              </span>
            </h1>

            <motion.p {...fadeUp(0.12)} className="p">
              We combine <b>specialist doctors</b>, patient-first care, and high-standard technology to deliver treatment you can trust —
              from consultation to recovery.
            </motion.p>

            <motion.div {...fadeUp(0.18)} className="pills">
              <div className="pill"><span className="dot" /> 24/7 Emergency Support</div>
              <div className="pill"><span className="dot" /> Advanced Diagnostics</div>
              <div className="pill"><span className="dot" /> Transparent Treatment Plans</div>
            </motion.div>

          </div>

          {/* RIGHT: OWNER MESSAGE CARD */}
          <motion.div style={{ y: floatY }} className="glass wyNeo-ownerCard">
            <div className="wyNeo-ownerLeft">
              <div className="wyNeo-ownerImg">
                <img src={owner.photo} alt="Owner Doctor" />
              </div>
            </div>

            <div className="wyNeo-ownerRight">
              <div className="wyNeo-ownerName">{owner.name}</div>
              <div className="wyNeo-ownerRole">{owner.role}</div>

              <div className="wyNeo-ownerMsg">
                “{owner.msg}”
              </div>

              <div className="wyNeo-scrollHint">Scroll down for awards + patient comments</div>
            </div>
          </motion.div>
        </div>

        {/* 3 feature cards */}
        <div className="container wyNeo-cards">
          <div className="grid3">
            {reasons.map((c, i) => (
              <motion.div key={c.title} className="glass card wyNeo-mini" {...pop(i * 0.06)}>
                <div className="cardTitle">
                  <SplitWords text={c.title} delay={0.02} />
                </div>
                <div className="cardText">{c.text}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT TEXT (nice scroll reveal) */}
      <section className="wyNeo-section">
        <div className="container">
          <motion.p {...fadeUp(0)} className="wyNeo-para" style={{ fontWeight: 800 }}>
            We are a 24-hour patient care center situated at Nawala Junction, easily accessible from all directions with
            convenient parking at the hospital premises. Our hardworking and dedicated team of doctors and nurses sees every
            patient as family, not just a case number. We focus on delivering the best possible care so you feel safe,
            supported, and respected throughout your treatment journey. We are also deeply committed to both your mental and
            physical wellbeing, helping you move toward your healthiest and strongest version of yourself.
          </motion.p>
        </div>
      </section>

      {/* AWARDS with REAL photos */}
      <section className="wyNeo-section" id="awards">
        <div className="container">
          <motion.h2 {...fadeUp(0)} className="wyNeo-h2">
            <SplitWords text="Awards & Recognition" delay={0.05} />
          </motion.h2>

          <div className="wyNeo-awGrid">
            {awards.map((a, i) => (
              <motion.div key={a.year} className="glass card wyNeo-aw" {...pop(i * 0.06)}>
                <div className="wyNeo-awPhoto">
                  <img src={a.img} alt={`${a.year} award`} />
                </div>

                <div className="wyNeo-awYear">{a.year}</div>
                <div className="cardTitle">{a.title}</div>
                <div className="cardText">{a.note}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* COMMENTS */}
      <section className="wyNeo-section">
        <div className="container">
          <motion.h2 {...fadeUp(0)} className="wyNeo-h2">
            <SplitWords text="Patient Comments" delay={0.05} />
          </motion.h2>

          <div className="grid3 wyNeo-commentGrid">
            {comments.map((c, i) => (
              <motion.div key={c.name} className="glass card wyNeo-comment" {...pop(i * 0.06)}>
                <div className="wyNeo-commentTop">
                  <div>
                    <div className="wyNeo-name">{c.name}</div>
                    <div className="wyNeo-stars">5/5 ⭐</div>
                  </div>
                </div>
                <div className="cardText" style={{ marginTop: 10 }}>{c.text}</div>
              </motion.div>
            ))}
          </div>

          <motion.div className="glass wyNeo-cta" {...pop(0.06)}>
            <div className="wyNeo-ctaTitle">Need care now? We’re open 24/7</div>
            <div className="wyNeo-ctaBtns">
              <button className="btnPrimary" onClick={() => goToProtected("/echanneling")}>
                Book Appointment
              </button>
              <button className="btnGhost" onClick={() => (window.location.href = "tel:+94771234567")}>
                Call
              </button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
