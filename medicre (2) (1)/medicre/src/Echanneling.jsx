
import React, { useMemo, useState, useRef } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import "./echanneling.css";

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
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, delay: d, ease } },
});

const pop = (d = 0) => ({
  initial: { opacity: 0, scale: 0.97, y: 14 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 240, damping: 18, delay: d },
  },
});

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function makeRef() {
  const n = Math.floor(10000 + Math.random() * 90000);
  return `BMN-${n}`;
}

function makeQueue() {
  return String(Math.floor(1 + Math.random() * 25)).padStart(2, "0");
}

function getAppointments() {
  try {
    return JSON.parse(localStorage.getItem("bmn_appointments") || "[]");
  } catch {
    return [];
  }
}

function saveAppointments(list) {
  localStorage.setItem("bmn_appointments", JSON.stringify(list));
  window.dispatchEvent(new Event("bmn_appointments_updated"));
}

function onlyDigits(s) {
  return (s || "").replace(/\D/g, "");
}

/* Confirmation Modal */
function ConfirmModal({ open, data, onClose, onBookAnother }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="confOverlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="confModal glass"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.35, ease }}
          >
            <div className="confTop">
              <div>
                <div className="confKicker">
                  <span className="confDot" />
                  Appointment Confirmed
                </div>
                <div className="confTitle">Your spot is reserved ✅</div>
                <div className="confSub">
                  You have successfully placed your spot with the selected doctor.
                  <br />
                  ✅ Verification SMS sent to <b>{data?.phone || "your phone"}</b>
                </div>
              </div>

              <button className="confClose" type="button" onClick={onClose} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="confGrid">
              <div className="confCard">
                <div className="confLabel">Patient</div>
                <div className="confValue">{data?.patientText || "-"}</div>
              </div>

              <div className="confCard">
                <div className="confLabel">Service</div>
                <div className="confValue">{data?.service || "-"}</div>
              </div>

              <div className="confCard">
                <div className="confLabel">Doctor</div>
                <div className="confValue">{data?.doctor || "-"}</div>
                <div className="confMini">{data?.spec || ""}</div>
              </div>

              <div className="confCard">
                <div className="confLabel">Date</div>
                <div className="confValue">{data?.dateNice || "-"}</div>
              </div>

              <div className="confCard">
                <div className="confLabel">Time</div>
                <div className="confValue">{data?.timeNice || "-"}</div>
              </div>

              <div className="confCard">
                <div className="confLabel">Payment</div>
                <div className="confValue">
                  {data?.paymentMethod === "card" ? "Card Payment" : "Cash Payment"}
                </div>
                <div className="confMini">
                  Status: <b>{data?.paymentStatus === "PAID" ? "PAID ✅" : "PENDING ⏳"}</b>
                </div>
              </div>
            </div>

            <div className="confBar">
              <div className="confPills">
                <span className="confPill">
                  Ref: <b>{data?.ref || "-"}</b>
                </span>
                <span className="confPill">
                  Queue: <b>{data?.queue || "-"}</b>
                </span>
              </div>
              <div className="confSms">
                Please arrive 10–15 minutes early. If you don’t receive SMS within 5 minutes, call{" "}
                <b>+94 77 123 4567</b>.
              </div>
            </div>

            <div className="confActions">
              <button className="confBtnGhost" type="button" onClick={onBookAnother}>
                Book Another
              </button>
              <button className="confBtnPrimary" type="button" onClick={onClose}>
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Echanneling() {
  const doctors = useMemo(
    () => [
      { name: "Dr. Asanka Weerasinghe", spec: "Internal Medicine" },
      { name: "Dr. A. Perera", spec: "General Physician" },
      { name: "Dr. N. Silva", spec: "Psychiatrist" },
      { name: "Dr. S. Jayasinghe", spec: "Physiotherapist" },
      { name: "Dr. R. Fernando", spec: "Dermatology / Aesthetic" },
      { name: "Dr. M. Kumara", spec: "Counsellor" },
      { name: "Dr. K. Wijesuriya", spec: "Lab Consultant" },
    ],
    []
  );

  const [patientMode, setPatientMode] = useState("id"); // "id" | "name"

  // paymentMethod starts EMPTY (must select)
  const [form, setForm] = useState({
    patientId: "",
    name: "",
    age: "",
    phone: "",
    service: "OPD",
    doctor: doctors[0].name,
    date: "",
    time: "",
    note: "",

    paymentMethod: "",
    cardName: "",
    cardNumber: "",
    cardExp: "",
    cardCvv: "",
  });

  const [status, setStatus] = useState({ type: "idle", msg: "" });
  const [attempted, setAttempted] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  const payRef = useRef(null);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
  };

  const switchMode = (mode) => {
    setPatientMode(mode);
    setStatus({ type: "idle", msg: "" });
    setAttempted(false);

    setForm((s) => ({
      ...s,
      patientId: mode === "id" ? s.patientId : "",
      name: mode === "name" ? s.name : "",
    }));
  };

  //  validation (strict)
  const errors = useMemo(() => {
    const e = {};

    const hasIdentity = patientMode === "id" ? form.patientId.trim() : form.name.trim();

    if (!hasIdentity) e.identity = "Required";
    if (!form.phone.trim()) e.phone = "Required";
    if (!form.date) e.date = "Required";
    if (!form.time) e.time = "Required";
    if (!form.doctor) e.doctor = "Required";

    if (!form.paymentMethod) e.paymentMethod = "Choose payment method";

    if (form.paymentMethod === "card") {
      if (!form.cardName.trim()) e.cardName = "Card name required";

      const digits = onlyDigits(form.cardNumber);
      if (!digits || digits.length < 12) e.cardNumber = "Valid card number required";

      if (!/^\d{2}\/\d{2}$/.test(form.cardExp.trim())) e.cardExp = "Use MM/YY";

      if (!/^\d{3,4}$/.test(form.cardCvv.trim())) e.cardCvv = "CVV must be 3-4 digits";
    }

    return e;
  }, [form, patientMode]);

  const canSubmit = Object.keys(errors).length === 0;

  const setPay = (method) => {
    setForm((s) => ({
      ...s,
      paymentMethod: method,
      // optional clear when switching
      cardName: method === "card" ? s.cardName : "",
      cardNumber: method === "card" ? s.cardNumber : "",
      cardExp: method === "card" ? s.cardExp : "",
      cardCvv: method === "card" ? s.cardCvv : "",
    }));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    setAttempted(true);

    if (!canSubmit) {
      setStatus({
        type: "error",
        msg: "Please complete required fields — especially Payment method 👇",
      });

      // scroll to payment block if payment is the problem
      if (errors.paymentMethod || errors.cardName || errors.cardNumber || errors.cardExp || errors.cardCvv) {
        payRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    const selectedDoctor = doctors.find((d) => d.name === form.doctor);

    const patientText =
      patientMode === "id"
        ? `ID: ${form.patientId.trim()}`
        : `Name: ${form.name.trim()}${form.age.trim() ? ` (Age ${form.age.trim()})` : ""}`;

    const paymentStatus = form.paymentMethod === "card" ? "PAID" : "PENDING";

    const booking = {
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
      ref: makeRef(),
      queue: makeQueue(),
      patientMode,
      patientId: form.patientId.trim(),
      name: form.name.trim(),
      age: form.age.trim(),
      phone: form.phone.trim(),
      service: form.service,
      doctor: form.doctor,
      doctorSpec: selectedDoctor?.spec || "",
      date: form.date,
      time: form.time,
      note: form.note.trim(),
      paymentMethod: form.paymentMethod,
      paymentStatus,
      amount: form.service === "OPD" ? 1500 : 2500, // demo amount
      createdAt: new Date().toISOString(),
    };

    const list = getAppointments();
    saveAppointments([booking, ...list]);

    setConfirmData({
      patientText,
      phone: booking.phone,
      service: booking.service,
      doctor: booking.doctor,
      spec: booking.doctorSpec,
      dateNice: formatDate(booking.date),
      timeNice: formatTime(booking.time),
      ref: booking.ref,
      queue: booking.queue,
      paymentMethod: booking.paymentMethod,
      paymentStatus: booking.paymentStatus,
    });

    setStatus({ type: "success", msg: "Booking submitted ✅ Opening confirmation..." });
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    setConfirmOpen(false);
    setStatus({ type: "idle", msg: "" });
  };

  const bookAnother = () => {
    setConfirmOpen(false);
    setStatus({ type: "idle", msg: "" });
    setAttempted(false);
    setForm((s) => ({
      ...s,
      date: "",
      time: "",
      note: "",
      service: "OPD",
      doctor: doctors[0].name,

      paymentMethod: "",
      cardName: "",
      cardNumber: "",
      cardExp: "",
      cardCvv: "",
    }));
  };

  const paymentHasError =
    attempted &&
    (errors.paymentMethod || errors.cardName || errors.cardNumber || errors.cardExp || errors.cardCvv);

  return (
    <div className="page echPage">
      <section className="echHero">
        <div className="container">
          <motion.div {...fadeUp(0)} className="echKicker">
            <span className="echDot" />
            <span>E-channelling</span> <span className="echHeart">💙</span>
          </motion.div>

          <h1 className="echTitle">
            <SplitWords text="Book Your Appointment" delay={0.08} />
          </h1>

          <motion.p {...fadeUp(0.12)} className="echSub">
            Fill this form and we’ll confirm your appointment quickly ⚡
          </motion.p>

          <div className="echGrid">
            {/* LEFT */}
            <motion.div className="glass echCard" {...pop(0.06)}>
              <form onSubmit={onSubmit} className="echForm">
                <div className="echTabs">
                  <button
                    type="button"
                    className={patientMode === "id" ? "echTab active" : "echTab"}
                    onClick={() => switchMode("id")}
                  >
                    Patient ID 🪪
                  </button>
                  <button
                    type="button"
                    className={patientMode === "name" ? "echTab active" : "echTab"}
                    onClick={() => switchMode("name")}
                  >
                    Full Name 👤
                  </button>
                </div>

                <div className="echTwo">
                  <div className="echField">
                    <label>Patient ID</label>
                    <input
                      name="patientId"
                      value={form.patientId}
                      onChange={onChange}
                      placeholder="Ex: BMN-10245"
                      className={`echInput ${attempted && errors.identity && patientMode === "id" ? "echInvalid" : ""}`}
                      disabled={patientMode !== "id"}
                    />
                  </div>

                  <div className="echField">
                    <label>Full Name</label>
                    <input
                      name="name"
                      value={form.name}
                      onChange={onChange}
                      placeholder="Your name"
                      className={`echInput ${attempted && errors.identity && patientMode === "name" ? "echInvalid" : ""}`}
                      disabled={patientMode !== "name"}
                    />
                  </div>
                </div>

                <div className="echTwo">
                  <div className="echField">
                    <label>Age</label>
                    <input
                      name="age"
                      value={form.age}
                      onChange={onChange}
                      placeholder="Ex: 24"
                      className="echInput"
                      inputMode="numeric"
                    />
                  </div>

                  <div className="echField">
                    <label>Phone</label>
                    <input
                      name="phone"
                      value={form.phone}
                      onChange={onChange}
                      placeholder="+94..."
                      className={`echInput ${attempted && errors.phone ? "echInvalid" : ""}`}
                    />
                  </div>
                </div>

                <div className="echTwo">
                  <div className="echField">
                    <label>Service</label>
                    <select name="service" value={form.service} onChange={onChange} className="echInput">
                      <option>OPD</option>
                      <option>Psychiatric</option>
                      <option>Physiotherapy</option>
                      <option>Counselling</option>
                      <option>Aesthetic</option>
                      <option>Lab Testing</option>
                    </select>
                  </div>

                  <div className="echField">
                    <label>Select Doctor</label>
                    <select
                      name="doctor"
                      value={form.doctor}
                      onChange={onChange}
                      className={`echInput ${attempted && errors.doctor ? "echInvalid" : ""}`}
                    >
                      {doctors.map((d) => (
                        <option key={d.name} value={d.name}>
                          {d.name} — {d.spec}
                        </option>
                      ))}
                    </select>
                    <div className="echHint">
                      🩺 Selected: <b>{form.doctor}</b>
                    </div>
                  </div>
                </div>

                <div className="echTwo">
                  <div className="echField">
                    <label>Preferred Date</label>
                    <input
                      type="date"
                      name="date"
                      value={form.date}
                      onChange={onChange}
                      className={`echInput ${attempted && errors.date ? "echInvalid" : ""}`}
                    />
                  </div>

                  <div className="echField">
                    <label>Preferred Time</label>
                    <input
                      type="time"
                      name="time"
                      value={form.time}
                      onChange={onChange}
                      className={`echInput ${attempted && errors.time ? "echInvalid" : ""}`}
                    />
                  </div>
                </div>

                {/* Payment Method (STRICT + highlight) */}
                <div
                  ref={payRef}
                  className={`echPayBlock ${paymentHasError ? "error shake" : ""}`}
                >
                  <div className="echPayHead">Payment Method</div>

                  <div className="echPayTabs">
                    <button
                      type="button"
                      className={form.paymentMethod === "cash" ? "echPayTab active" : "echPayTab"}
                      onClick={() => setPay("cash")}
                    >
                      Cash 💵 (Pay at Hospital)
                    </button>
                    <button
                      type="button"
                      className={form.paymentMethod === "card" ? "echPayTab active" : "echPayTab"}
                      onClick={() => setPay("card")}
                    >
                      Card 💳 (Pay Online)
                    </button>
                  </div>

                  {attempted && errors.paymentMethod && (
                    <div className="echPayError">⚠️ Please choose a payment method to continue.</div>
                  )}

                  {form.paymentMethod === "card" && (
                    <div className="echCardFields">
                      <div className="echTwo">
                        <div className="echField">
                          <label>Card Holder Name</label>
                          <input
                            name="cardName"
                            value={form.cardName}
                            onChange={onChange}
                            className={`echInput ${attempted && errors.cardName ? "echInvalid" : ""}`}
                            placeholder="Ex: Jonathan Silva"
                          />
                          {attempted && errors.cardName && <div className="echFieldErr">{errors.cardName}</div>}
                        </div>
                        <div className="echField">
                          <label>Card Number</label>
                          <input
                            name="cardNumber"
                            value={form.cardNumber}
                            onChange={onChange}
                            className={`echInput ${attempted && errors.cardNumber ? "echInvalid" : ""}`}
                            placeholder="1234 5678 9012 3456"
                          />
                          {attempted && errors.cardNumber && <div className="echFieldErr">{errors.cardNumber}</div>}
                        </div>
                      </div>

                      <div className="echTwo">
                        <div className="echField">
                          <label>Expiry</label>
                          <input
                            name="cardExp"
                            value={form.cardExp}
                            onChange={onChange}
                            className={`echInput ${attempted && errors.cardExp ? "echInvalid" : ""}`}
                            placeholder="MM/YY"
                          />
                          {attempted && errors.cardExp && <div className="echFieldErr">{errors.cardExp}</div>}
                        </div>
                        <div className="echField">
                          <label>CVV</label>
                          <input
                            name="cardCvv"
                            value={form.cardCvv}
                            onChange={onChange}
                            className={`echInput ${attempted && errors.cardCvv ? "echInvalid" : ""}`}
                            placeholder="123"
                          />
                          {attempted && errors.cardCvv && <div className="echFieldErr">{errors.cardCvv}</div>}
                        </div>
                      </div>

                      <div className="echPayHint">🔒 Demo UI only — connect payment gateway later.</div>
                    </div>
                  )}

                  {form.paymentMethod === "cash" && (
                    <div className="echPayHint">
                      ✅ Cash selected — payment will show as <b>PENDING</b> in your dashboard.
                    </div>
                  )}
                </div>

                <div className="glass echTips">
                  <div className="echTipsTitle">✨ Quick Tips</div>
                  <ul className="echTipsList">
                    <li>Choose a doctor you prefer 👨‍⚕️</li>
                    <li>Keep phone available 📞</li>
                    <li>Arrive 10–15 minutes early ⏰</li>
                  </ul>
                </div>

                <div className="echField">
                  <label>Note (optional)</label>
                  <textarea
                    name="note"
                    value={form.note}
                    onChange={onChange}
                    placeholder="Symptoms / request..."
                    className="echTextarea"
                    rows={4}
                  />
                </div>

                {status.type !== "idle" && (
                  <div className={status.type === "success" ? "echAlert ok" : "echAlert bad"}>
                    {status.msg}
                  </div>
                )}

                {/* ✅ Disabled until valid */}
                <button className="echSubmit" type="submit" disabled={!canSubmit}>
                  BOOKING NOW ✅
                </button>
              </form>
            </motion.div>

            {/* RIGHT */}
            <div className="echRight">
              <motion.div className="glass echInfo" {...pop(0.10)}>
                <div className="echInfoRow">
                  <div className="echInfoHead">
                    <span className="echIcon">🕒</span> Working Hours
                  </div>
                  <div className="echInfoText">Mon–Sat: 8:00am – 8:00pm</div>
                  <div className="echInfoText">Emergency: 24/7 🚑</div>
                </div>

                <div className="echDivider" />

                <div className="echInfoRow">
                  <div className="echInfoHead">
                    <span className="echIcon">📍</span> Location
                  </div>
                  <div className="echInfoText">Nawala Junction, Colombo</div>
                </div>

                <div className="echDivider" />

                <div className="echInfoRow">
                  <div className="echInfoHead">
                    <span className="echIcon">📞</span> Hotline
                  </div>
                  <div className="echInfoText">+94 77 123 4567</div>
                </div>
              </motion.div>

              <motion.div className="glass echWhy" {...pop(0.16)}>
                <div className="echWhyTitle">💙 Why E-channelling?</div>
                <div className="echWhyItem">✅ Fast booking</div>
                <div className="echWhyItem">✅ Less waiting time</div>
                <div className="echWhyItem">✅ Easy follow-ups</div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <ConfirmModal
        open={confirmOpen}
        data={confirmData}
        onClose={closeConfirm}
        onBookAnother={bookAnother}
      />
    </div>
  );
}
