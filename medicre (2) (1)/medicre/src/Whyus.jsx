import React, { useMemo, useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import "./Whyus.css";

// ✅ Images (must exist in src/assets)
import doctorImg from "./assets/docter.png";
import award1 from "./assets/award1.png";
import award2 from "./assets/award2.png";
import award3 from "./assets/award3.png";

const ease = [0.22, 1, 0.36, 1];

function Reveal({ children, delay = 0, y = 18, className = "" }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { margin: "-12% 0px -12% 0px", once: true });

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y, filter: "blur(8px)" }}
      animate={inView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
      transition={{ duration: 0.7, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

function SplitLine({ text, delay = 0 }) {
  const reduce = useReducedMotion();
  const words = useMemo(() => text.split(" "), [text]);

  if (reduce) return <span>{text}</span>;

  return (
    <span className="wuSplit" aria-label={text}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          className="wuWord"
          initial={{ y: 18, opacity: 0, filter: "blur(7px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.55, delay: delay + i * 0.045, ease }}
        >
          {w}&nbsp;
        </motion.span>
      ))}
    </span>
  );
}

export default function Whyus() {
  const awards = [
    {
      year: "2023",
      title: "Healthcare Leader of the Year",
      note: "Recognized for patient-first service quality and consistent outcomes.",
      img: award1,
    },
    {
      year: "2022",
      title: "Excellence in Patient Care",
      note: "Awarded for compassionate care, safety, and follow-up standards.",
      img: award2,
    },
    {
      year: "2021",
      title: "Best Medical Center Award",
      note: "Honored for modern facilities and trusted clinical teams.",
      img: award3,
    },
  ];

  const testimonials = [
    {
      name: "Nimali K.",
      text:
        "From the first consultation to follow-up, everything felt calm and professional. The staff explained clearly, and the process was smooth.",
      meta: "OPD • Colombo",
    },
    {
      name: "Chandis S.",
      text:
        "The doctors were kind and direct. I felt listened to, and the treatment plan was explained in a way I could trust.",
      meta: "Physiotherapy • Nawala",
    },
    {
      name: "Tharindu P.",
      text:
        "Fast booking, clean environment, and very friendly support. Results and updates were handled neatly and quickly.",
      meta: "Lab Testing • Colombo",
    },
  ];

  return (
    <div className="wuPage">
      <div className="wuGlow" />

      <section className="wuContainer">
        {/* HERO */}
        <div className="wuHero">
          <Reveal className="wuHeroLeft" delay={0.02}>
            <div className="wuKicker">
              <span className="wuDot" />
              Trusted Care • Modern Facilities • Expert Team
            </div>

            <h1 className="wuTitle">
              <SplitLine text="Why Patients Choose" delay={0.05} />
              <span className="wuAccent">
                <SplitLine text="Best Medicare Nawala" delay={0.12} />
              </span>
            </h1>

            <p className="wuSub">
              We deliver reliable healthcare through a specialist team, patient-first workflow,
              and modern clinical standards — from consultation to recovery.
            </p>

            <div className="wuActions">
              <button className="wuBtnPrimary">Book Appointment</button>
              <button className="wuBtnGhost">Talk to Support</button>
            </div>

            {/* PROOF METRICS */}
            <div className="wuMetrics">
              <div className="wuMetricCard">
                <div className="wuMetricValue">24/7</div>
                <div className="wuMetricLabel">Emergency Support</div>
              </div>
              <div className="wuMetricCard">
                <div className="wuMetricValue">98%</div>
                <div className="wuMetricLabel">Patient Satisfaction</div>
              </div>
              <div className="wuMetricCard">
                <div className="wuMetricValue">10+</div>
                <div className="wuMetricLabel">Specialist Areas</div>
              </div>
            </div>
          </Reveal>

          {/* Doctor Message Card */}
          <Reveal className="wuHeroRight" delay={0.10} y={22}>
            <div className="wuDoctorCard">
              <div className="wuDoctorRow">
                <img className="wuDoctorImg" src={doctorImg} alt="Hospital Director" />
                <div>
                  <div className="wuDoctorName">Dr. Asanka Weerasinghe</div>
                  <div className="wuDoctorRole">Director of Medical Services</div>
                </div>
              </div>

              <p className="wuDoctorMsg">
                At Best Medicare Nawala, our goal is simple: treat every patient with respect,
                clarity, and care. We focus on accurate diagnosis, honest guidance, and thoughtful
                follow-up — so you always feel safe, informed, and supported.
              </p>

              <div className="wuDoctorFoot">
                <span className="wuPill">Verified Care ✅</span>
                <span className="wuPill">Modern Standards 🧪</span>
              </div>
            </div>
          </Reveal>
        </div>

        {/* STORY PANELS */}
        <div className="wuStory">
          <Reveal className="wuStoryCard" delay={0.02}>
            <h3>Care that feels structured — not stressful</h3>
            <p>
              From booking to consultation, our process is designed to reduce friction. Patients
              receive clear next steps, accurate timelines, and a calm environment that supports
              confidence.
            </p>
          </Reveal>

          <Reveal className="wuStoryCard" delay={0.06}>
            <h3>A team built on consistency</h3>
            <p>
              Our doctors and nurses follow modern protocols while keeping communication human.
              We explain what matters, keep you updated, and support your recovery with care that
              stays dependable.
            </p>
          </Reveal>

          <Reveal className="wuStoryCard" delay={0.10}>
            <h3>Modern tools, practical results</h3>
            <p>
              We combine updated diagnostics and clean workflows to help decisions stay accurate
              and fast — without compromising safety or patient comfort.
            </p>
          </Reveal>
        </div>

        {/* AWARDS */}
        <Reveal delay={0.02}>
          <div className="wuSectionHead">
            <h2>Awards & Recognition</h2>
            <p>
              External recognition matters — but we care more about what it represents: consistent
              outcomes, safety, and patient trust.
            </p>
          </div>
        </Reveal>

        <div className="wuAwards">
          {awards.map((a, idx) => (
            <Reveal key={a.year} className="wuAwardCard" delay={0.05 + idx * 0.05}>
              <div className="wuAwardTop">
                <span className="wuYear">{a.year}</span>
                <span className="wuBadge">Award</span>
              </div>

              <div className="wuAwardMedia">
                <img src={a.img} alt={a.title} />
              </div>

              <div className="wuAwardTitle">{a.title}</div>
              <div className="wuAwardNote">{a.note}</div>
            </Reveal>
          ))}
        </div>

        {/* TESTIMONIALS */}
        <Reveal delay={0.02}>
          <div className="wuSectionHead">
            <h2>Patient Comments</h2>
            <p>Real feedback helps us improve and helps new patients feel confident.</p>
          </div>
        </Reveal>

        <div className="wuTestimonials">
          {testimonials.map((t, idx) => (
            <Reveal key={t.name} className="wuTestCard" delay={0.05 + idx * 0.05}>
              <div className="wuTestTop">
                <div className="wuAvatar">{t.name.slice(0, 1)}</div>
                <div>
                  <div className="wuTestName">{t.name}</div>
                  <div className="wuTestMeta">{t.meta}</div>
                </div>
                <div className="wuStars">★★★★★</div>
              </div>
              <p className="wuTestText">{t.text}</p>
            </Reveal>
          ))}
        </div>

        {/* CTA */}
        <Reveal delay={0.02}>
          <div className="wuCTA">
            <div>
              <div className="wuCTATitle">Need care now? We’re open 24/7 🌙</div>
              <div className="wuCTASub">
                Book your appointment in minutes — we’ll confirm quickly.
              </div>
            </div>
            <div className="wuCTAButtons">
              <button className="wuBtnPrimary">Book Appointment</button>
              <button className="wuBtnGhost">Call</button>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
