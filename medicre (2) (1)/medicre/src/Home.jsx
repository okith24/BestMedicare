import React, { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import heroImage from "./assets/hero.webp";
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
          transition={{ duration: 0.55, delay: delay + i * 0.05, ease }}
        >
          {w}&nbsp;
        </motion.span>
      ))}
    </span>
  );
}

const fadeUp = (d = 0) => ({
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0, transition: { duration: 0.6, delay: d, ease } },
  viewport: { once: true, amount: 0.25 },
});

const popInView = (d = 0) => ({
  initial: { opacity: 0, scale: 0.96, y: 16 },
  whileInView: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 230, damping: 18, delay: d },
  },
  viewport: { once: true, amount: 0.25 },
});

export default function Home() {
  // Handles homepage navigation helpers and service card data.
  const navigate = useNavigate();
  const { user } = useAuth();

  const goToProtected = (path) => {
    if (user) {
      navigate(path);
      return;
    }
    navigate("/signup", { state: { from: path } });
  };

  const serviceToEchannelingValue = (title) => {
    const map = {
      OPD: "OPD",
      Psychiatric: "Psychiatric",
      Physiotherapy: "Physiotherapy",
      Counselling: "Counselling",
      Aesthetic: "Aesthetic",
      Psychology: "Psychiatric",
    };
    return map[title] || "OPD";
  };

  const goToServiceBooking = (title) => {
    const selected = serviceToEchannelingValue(title);
    goToProtected(`/echanneling?service=${encodeURIComponent(selected)}`);
  };

  const services = [
    {
      title: "OPD",
      text: "General consultations, quick diagnosis, and expert guidance - same day care.",
      img: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=1600&q=70",
    },
    {
      title: "Psychiatric",
      text: "Mental health support, evaluations, and therapy plans with compassionate care.",
      img: "https://images.unsplash.com/photo-1526256262350-7da7584cf5eb?auto=format&fit=crop&w=1600&q=70",
    },
    {
      title: "Physiotherapy",
      text: "Rehab and recovery programs to restore mobility and reduce pain safely.",
      img: "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1600&q=70",
    },
    {
      title: "Counselling",
      text: "Professional counselling for individuals & families - calm, clear, supportive.",
      img: "https://images.unsplash.com/photo-1527137342181-19aab11a8ee8?auto=format&fit=crop&w=1600&q=70",
    },
    {
      title: "Aesthetic",
      text: "Advanced aesthetic treatments and dermatology procedures for confidence.",
      img: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=1600&q=70",
    },
  ];

  return (
    <div className="page">
      {/* HERO */}
      <section className="homeNeo-hero">
        <div className="homeNeo-heroBg">
          <img src={heroImage} alt="Best Medicare Nawala" />
        </div>
        <div className="homeNeo-heroScrim" />

        <div className="container homeNeo-heroContent">
          <h1 className="h1 homeNeo-heroTitle">
            <SplitWords text="Welcome to" delay={0.08} />
            <br />
            <span className="accent">
              <SplitWords text="BEST MEDICARE NAWALA" delay={0.22} />
            </span>
          </h1>

          <motion.p {...fadeUp(0.3)} className="p homeNeo-heroText">
            Experience world-class healthcare with specialist doctors and patient-first service.
            We deliver accurate diagnosis, honest guidance, and smooth recovery support.
          </motion.p>

          <motion.div {...fadeUp(0.4)} className="homeNeo-actions">
            <button className="btnPrimary" onClick={() => goToProtected("/echanneling")}>
              Book Appointment
            </button>
            <button className="btnGhost" onClick={() => navigate("/whyus")}>
              Virtual Tour
            </button>
          </motion.div>

          <motion.div {...fadeUp(0.5)} className="pills">
            <div className="pill">24/7 Emergency Support</div>
            <div className="pill">Advanced Diagnostics</div>
            <div className="pill">Transparent Plans</div>
          </motion.div>

          <motion.div {...fadeUp(0.6)} className="homeNeo-live homeNeo-liveStandalone">
            <span className="homeNeo-liveDot" />
            Live assistance available
          </motion.div>

          <motion.div {...fadeUp(0.7)} className="homeNeo-miniRow homeNeo-miniRowStandalone">
            <div className="glass homeNeo-miniCard">
              <div className="homeNeo-miniTop">
                <div className="homeNeo-miniIcon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
                  </svg>
                </div>
                <div>
                  <div className="homeNeo-miniTitle">Fast Booking</div>
                  <div className="homeNeo-miniText">E-channelling in minutes</div>
                </div>
              </div>
            </div>

            <div className="glass homeNeo-miniCard">
              <div className="homeNeo-miniTop">
                <div className="homeNeo-miniIcon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
                <div>
                  <div className="homeNeo-miniTitle">Clear Reports</div>
                  <div className="homeNeo-miniText">Digital results + follow up</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="homeNeo-scrollHint">
          <span>Scroll</span>
          <svg className="homeNeo-scrollChevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </section>

      {/* SERVICES */}
      <section className="homeNeo-section">
        <div className="container">
          <motion.div {...fadeUp(0)} className="homeNeo-head">
            <h2 className="homeNeo-h2">Our Specialised Services</h2>
            <div className="homeNeo-line" />
            <p className="homeNeo-muted">Choose a service - we'll handle the rest.</p>
          </motion.div>

          <div className="homeNeo-serviceGrid">
            {services.map((s, i) => (
              <motion.div
                key={s.title}
                className="glass homeNeo-serviceCard"
                {...popInView(i * 0.06)}
                onClick={() => goToServiceBooking(s.title)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    goToServiceBooking(s.title);
                  }
                }}
              >
                <div className="homeNeo-serviceImg">
                  <img src={s.img} alt={s.title} />
                </div>

                <div className="homeNeo-serviceBody">
                  <div className="homeNeo-serviceTop">
                    <div className="homeNeo-serviceTitle">
                      {s.title}
                    </div>
                    <button
                      type="button"
                      className="homeNeo-arrow"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToServiceBooking(s.title);
                      }}
                      aria-label={`Book ${s.title}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                  <div className="homeNeo-serviceText">{s.text}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PARTNERSHIPS */}
      <section className="homeNeo-section">
        <div className="container">
          <motion.div {...fadeUp(0)} className="homeNeo-head">
            <h2 className="homeNeo-h2">Our Partnerships</h2>
            <p className="homeNeo-muted">Working with trusted partners for better care.</p>
          </motion.div>

          <div className="homeNeo-partGrid">
            <motion.div className="glass homeNeo-partCard homeNeo-purple" {...popInView(0.05)}>
              <div className="homeNeo-pill">AVAILABLE 24/7</div>
              <div className="homeNeo-partTitle">In-House Pharmacy</div>
              <div className="homeNeo-partText">
                Get prescribed medicines instantly. We keep a reliable inventory of local & imported meds.
              </div>
              <button className="btnGhost homeNeo-linkBtn" onClick={() => goToProtected("/echanneling")}>
                View Pharmacy Services
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </button>

              <div className="homeNeo-partImg">
                <img
                  src="https://images.unsplash.com/photo-1580281657527-47f249e8f4df?auto=format&fit=crop&w=1600&q=70"
                  alt="Pharmacy"
                />
              </div>
            </motion.div>

            <motion.div className="glass homeNeo-partCard" {...popInView(0.12)}>
              <div className="homeNeo-small">IN COLLABORATION WITH</div>
              <div className="homeNeo-partTitle">
                Lab Testing by <span className="homeNeo-blue">Kings & Naweloka</span>
              </div>
              <div className="homeNeo-partText">
                Precision diagnostics powered by trusted lab services - accurate and fast reporting.
              </div>
              <button className="btnGhost homeNeo-linkBtn" onClick={() => goToProtected("/echanneling")}>
                Schedule Lab Test
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </button>

              <div className="homeNeo-partImg">
                <img
                  src="/images/lab-testing.webp"
                  alt="Lab"
                />
              </div>
            </motion.div>
          </div>

          <motion.div className="glass homeNeo-cta" {...popInView(0.08)}>
            <div className="homeNeo-ctaHead">
              <div className="homeNeo-ctaTitle">Ready to book an appointment?</div>
              <button className="btnPrimary homeNeo-ctaGetStarted" onClick={() => goToProtected("/echanneling")}>
                Get Started
              </button>
            </div>
            <div className="homeNeo-ctaText">
              Manage appointments, services, pharmacy and lab results in one place.
            </div>
          </motion.div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="homeNeo-section">
        <div className="container">
          <motion.div {...fadeUp(0)} className="homeNeo-head">
            <h2 className="homeNeo-h2">Contact Us</h2>
            <p className="homeNeo-muted">Reach us directly for appointments or inquiries.</p>
          </motion.div>

          <div className="homeNeo-contactGrid">
            <div className="glass homeNeo-contactCard">
              <div className="homeNeo-contactTitle">Address</div>
              <div className="homeNeo-contactText">
                321 Nawala Rd, Sri Jayawardenepura Kotte 11222, Sri Lanka
              </div>
            </div>

            <div className="glass homeNeo-contactCard">
              <div className="homeNeo-contactTitle">Phone</div>
              <div className="homeNeo-contactText">+94 72 222 5566</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}







