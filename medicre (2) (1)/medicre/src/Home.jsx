import React, { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import "./home.css";

const ease = [0.22, 1, 0.36, 1];

function SplitWords({ text, delay = 0 }) {
  const shouldReduce = useReducedMotion();
  const words = useMemo(() => text.split(" "), [text]);

  if (shouldReduce) return <span>{text}</span>;

  return (
    <span className="splitWrap" aria-label={text}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          className="splitWord"
          initial={{ y: 18, opacity: 0, filter: "blur(6px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: delay + i * 0.06, ease }}
        >
          {w}&nbsp;
        </motion.span>
      ))}
    </span>
  );
}

/*  premium stagger container */
const staggerWrap = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.02 },
  },
};

/*  soft reveal item */
const revealItem = {
  hidden: { opacity: 0, y: 18, filter: "blur(10px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.85, ease } },
};

const sectionFade = {
  hidden: { opacity: 0, y: 18, filter: "blur(10px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.9, ease } },
};

const popInView = (d = 0) => ({
  initial: { opacity: 0, scale: 0.975, y: 24, filter: "blur(10px)" },
  whileInView: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      type: "spring",
      stiffness: 160,   // slower
      damping: 22,      // smoother
      mass: 0.9,
      delay: d,
    },
  },
  viewport: { once: true, amount: 0.22 },
});

export default function Home() {
  const services = [
    {
      emoji: "🏥",
      title: "OPD",
      text: "General consultations, quick diagnosis, and expert guidance — same day care.",
      img: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=1600&q=70",
    },
    {
      emoji: "🧠",
      title: "Psychiatric",
      text: "Mental health support, evaluations, and therapy plans with compassionate care.",
      img: "https://images.unsplash.com/photo-1526256262350-7da7584cf5eb?auto=format&fit=crop&w=1600&q=70",
    },
    {
      emoji: "💪",
      title: "Physiotherapy",
      text: "Rehab and recovery programs to restore mobility and reduce pain safely.",
      img: "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1600&q=70",
    },
    {
      emoji: "💬",
      title: "Counselling",
      text: "Professional counselling for individuals & families — calm, clear, supportive.",
      img: "https://images.unsplash.com/photo-1527137342181-19aab11a8ee8?auto=format&fit=crop&w=1600&q=70",
    },
    {
      emoji: "✨",
      title: "Aesthetic",
      text: "Advanced aesthetic treatments and dermatology procedures for confidence.",
      img: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=1600&q=70",
    },
  ];

  const reduced = useReducedMotion();

  return (
    <div className="page homeNeoPage">
      {/* HERO */}
      <section className="homeNeo-hero">
        <div className="container homeNeo-grid">
          {/* Left */}
          <motion.div
            className="homeNeo-left"
            variants={staggerWrap}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={revealItem} className="kicker">
              <span className="dot" /> Smart Care • Trusted Doctors • Modern Tech
            </motion.div>

            <motion.h1 variants={revealItem} className="h1 homeNeo-title">
              <SplitWords text="Compassionate Care," delay={0.08} />
              <br />
              <span className="accent">
                <SplitWords text="Advanced Technology" delay={0.22} />
              </span>
            </motion.h1>

            <motion.p variants={revealItem} className="p">
              Experience world-class healthcare with specialist doctors and patient-first service.
              We deliver accurate diagnosis, honest guidance, and smooth recovery support.
            </motion.p>

            <motion.div variants={revealItem} className="homeNeo-actions">
              <button className="btnPrimary">Book Appointment 💜</button>
              <button className="btnGhost">Virtual Tour ▶</button>
            </motion.div>

            <motion.div variants={revealItem} className="pills">
              <div className="pill">
                <span className="dot" /> 24/7 Emergency Support
              </div>
              <div className="pill">
                <span className="dot" /> Advanced Diagnostics
              </div>
              <div className="pill">
                <span className="dot" /> Transparent Plans
              </div>
            </motion.div>
          </motion.div>

          {/* Right hero card */}
          <motion.div
            className="glass homeNeo-heroCard hoverLift"
            initial={{ opacity: 0, x: 18, scale: 0.985, filter: "blur(10px)" }}
            animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 1.05, ease }}
          >
            <div className="homeNeo-heroGlow" />
            <div className="homeNeo-heroMedia">
              <img
                src="https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=1800&q=70"
                alt="Medical Team"
              />
            </div>

            <div className="homeNeo-live">
              <span className="homeNeo-liveDot" />
              Live assistance available
            </div>

            <div className="homeNeo-miniRow">
              <div className="glass homeNeo-miniCard hoverMini">
                <div className="homeNeo-miniTop">
                  <div className="iconBox">⚡</div>
                  <div>
                    <div className="homeNeo-miniTitle">Fast Booking</div>
                    <div className="homeNeo-miniText">E-channelling in minutes</div>
                  </div>
                </div>
              </div>

              <div className="glass homeNeo-miniCard hoverMini">
                <div className="homeNeo-miniTop">
                  <div className="iconBox">🧾</div>
                  <div>
                    <div className="homeNeo-miniTitle">Clear Reports</div>
                    <div className="homeNeo-miniText">Digital results + follow up</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* SERVICES */}
      <motion.section
        className="homeNeo-section"
        variants={sectionFade}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.18 }}
      >
        <div className="container">
          <motion.div variants={staggerWrap} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.22 }} className="homeNeo-head">
            <motion.h2 variants={revealItem} className="homeNeo-h2">Our Specialised Services</motion.h2>
            <motion.div variants={revealItem} className="homeNeo-line" />
            <motion.p variants={revealItem} className="homeNeo-muted">Choose a service — we’ll handle the rest 💙</motion.p>
          </motion.div>

          <div className="homeNeo-serviceGrid">
            {services.map((s, i) => (
              <motion.div
                key={s.title}
                className="glass homeNeo-serviceCard hoverLift"
                {...popInView(i * 0.08)}
              >
                <div className="homeNeo-serviceImg">
                  <img src={s.img} alt={s.title} />
                </div>

                <div className="homeNeo-serviceBody">
                  <div className="homeNeo-serviceTop">
                    <div className="homeNeo-serviceTitle">
                      <span className="iconBox">{s.emoji}</span>
                      {s.title}
                    </div>
                    <div className="homeNeo-arrow">→</div>
                  </div>
                  <div className="homeNeo-serviceText">{s.text}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* PARTNERSHIPS */}
      <motion.section
        className="homeNeo-section"
        variants={sectionFade}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.18 }}
      >
        <div className="container">
          <motion.div variants={staggerWrap} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.22 }} className="homeNeo-head">
            <motion.h2 variants={revealItem} className="homeNeo-h2">Our Partnerships</motion.h2>
            <motion.p variants={revealItem} className="homeNeo-muted">Working with trusted partners for better care ✨</motion.p>
          </motion.div>

          <div className="homeNeo-partGrid">
            <motion.div className="glass homeNeo-partCard homeNeo-purple hoverLift" {...popInView(0.06)}>
              <div className="homeNeo-pill">AVAILABLE 24/7</div>
              <div className="homeNeo-partTitle">In-House Pharmacy 💊</div>
              <div className="homeNeo-partText">
                Get prescribed medicines instantly. We keep a reliable inventory of local & imported meds.
              </div>
              <button className="btnGhost homeNeo-linkBtn">View Pharmacy Services →</button>

              <div className="homeNeo-partImg">
                <img
                  src="https://images.unsplash.com/photo-1580281657527-47f249e8f4df?auto=format&fit=crop&w=1600&q=70"
                  alt="Pharmacy"
                />
              </div>
            </motion.div>

            <motion.div className="glass homeNeo-partCard hoverLift" {...popInView(0.14)}>
              <div className="homeNeo-small">IN COLLABORATION WITH</div>
              <div className="homeNeo-partTitle">
                Lab Testing by <span className="homeNeo-blue">Kings & Naweloka</span> 🧪
              </div>
              <div className="homeNeo-partText">
                Precision diagnostics powered by trusted lab services — accurate and fast reporting.
              </div>
              <button className="btnGhost homeNeo-linkBtn">Schedule Lab Test →</button>

              <div className="homeNeo-partImg">
                <img
                  src="https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1600&q=70"
                  alt="Lab"
                />
              </div>
            </motion.div>
          </div>

          <motion.div className="glass homeNeo-cta hoverLift" {...popInView(0.10)}>
            <div className="homeNeo-ctaTitle">Ready to book an appointment? 🚀</div>
            <div className="homeNeo-ctaText">
              Manage appointments, services, pharmacy and lab results in one place.
            </div>
            <div className="homeNeo-ctaBtns">
              <button className="btnPrimary">Get Started ✨</button>
              <button className="btnGhost">Contact Us 📞</button>
            </div>
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
}
