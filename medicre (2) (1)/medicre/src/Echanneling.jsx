import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";
import "./echanneling.css";
import { useAuth } from "./auth/AuthContext.jsx";
import { apiFetch } from "./api.js";

const ease = [0.22, 1, 0.36, 1];

const fallbackServices = [
  { name: "OPD", doctorCharge: 1000, hospitalCharge: 350, fee: 1350, doctorRequired: false, slotMinutes: 10, bookingWindowDays: 30 },
  { name: "Psychiatric", doctorCharge: 6000, hospitalCharge: 1000, fee: 7000, doctorRequired: true, slotMinutes: 10, bookingWindowDays: 30 },
  { name: "Physiotherapy", doctorCharge: 4000, hospitalCharge: 1000, fee: 5000, doctorRequired: true, slotMinutes: 10, bookingWindowDays: 30 },
  { name: "Counselling", doctorCharge: 5000, hospitalCharge: 1500, fee: 6500, doctorRequired: true, slotMinutes: 10, bookingWindowDays: 30 },
  { name: "Aesthetic", doctorCharge: 2500, hospitalCharge: 350, fee: 2850, doctorRequired: true, slotMinutes: 10, bookingWindowDays: 30 }
];

function SplitWords({ text, delay = 0 }) {
  const reduce = useReducedMotion();
  const words = useMemo(() => text.split(" "), [text]);

  if (reduce) return <span>{text}</span>;

  return (
    <span className="splitWrap" aria-label={text}>
      {words.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          className="splitWord"
          initial={{ y: 18, opacity: 0, filter: "blur(7px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.55, delay: delay + index * 0.05, ease }}
        >
          {word}&nbsp;
        </motion.span>
      ))}
    </span>
  );
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, delay, ease } }
});

const pop = (delay = 0) => ({
  initial: { opacity: 0, scale: 0.97, y: 14 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 240, damping: 18, delay }
  }
});

function formatBookedNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  const match = raw.match(/^([A-Z0-9-]+)-\d{8}-(\d{1,3})$/);
  if (!match) return raw;

  const service = match[1];
  const sequence = String(Number(match[2]) || 0).padStart(2, "0");
  return `${service} -${sequence}`;
}

function formatCardExpiryInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return `LKR ${amount.toLocaleString()}`;
}

function getPricing(config) {
  const doctorCharge = Number(config?.doctorCharge || 0);
  const hospitalCharge = Number(config?.hospitalCharge || 0);
  const fee = Number(config?.fee || doctorCharge + hospitalCharge || 0);

  return {
    doctorCharge,
    hospitalCharge,
    fee
  };
}

export default function Echanneling() {
  const { user } = useAuth();
  const location = useLocation();

  const [form, setForm] = useState({
    patientId: user?.patientId || "",
    name: "",
    age: "",
    gender: "",
    phone: "",
    service: "OPD",
    doctor: "",
    date: "",
    time: "",
    paymentMethod: "cash",
    cardHolder: "",
    cardNumber: "",
    cardExpiry: "",
    cardCvv: "",
    note: ""
  });

  const [status, setStatus] = useState({ type: "idle", msg: "" });
  const [services, setServices] = useState(fallbackServices);
  const [serviceConfig, setServiceConfig] = useState(fallbackServices[0]);
  const [doctorOptions, setDoctorOptions] = useState([]);
  const [slotOptions, setSlotOptions] = useState([]);
  const [dateRange, setDateRange] = useState({ minDate: "", maxDate: "" });
  const [doctorDisabled, setDoctorDisabled] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [isAutoFillingIdentity, setIsAutoFillingIdentity] = useState(false);

  const lookupSeqRef = useRef(0);
  const optionsSeqRef = useRef(0);

  const normalizeName = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

  useEffect(() => {
    if (!user?.patientId) return;
    setForm((prev) => (prev.patientId ? prev : { ...prev, patientId: user.patientId }));
  }, [user?.patientId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const selectedService = String(params.get("service") || "").trim();
    if (!selectedService) return;

    setForm((prev) => ({
      ...prev,
      service: selectedService,
      doctor: "",
      time: ""
    }));
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;
    const seq = ++optionsSeqRef.current;

    const loadOptions = async () => {
      try {
        setLoadingOptions(true);

        const search = new URLSearchParams();
        search.set("service", form.service);
        if (form.date) search.set("date", form.date);
        if (form.doctor) search.set("doctor", form.doctor);

        const payload = await apiFetch(`/api/patients/echanneling/options?${search.toString()}`);
        if (cancelled || optionsSeqRef.current !== seq) return;

        setServices(Array.isArray(payload?.services) && payload.services.length ? payload.services : fallbackServices);
        setServiceConfig(payload?.service || fallbackServices[0]);
        setDoctorOptions(Array.isArray(payload?.doctors) ? payload.doctors : []);
        setSlotOptions(Array.isArray(payload?.slots) ? payload.slots : []);
        setDateRange(payload?.dateRange || { minDate: "", maxDate: "" });
        setDoctorDisabled(!!payload?.doctorDisabled);

        setForm((prev) => {
          let nextDoctor = prev.doctor;
          let nextDate = prev.date;
          let nextTime = prev.time;

          if (payload?.doctorDisabled) {
            nextDoctor = payload?.selectedDoctor || "OPD Duty Doctor";
          } else {
            const validDoctor = (payload?.doctors || []).some((item) => item.name === prev.doctor);
            if (!validDoctor) nextDoctor = "";
          }

          if (
            nextDate
            && payload?.dateRange?.minDate
            && payload?.dateRange?.maxDate
            && (nextDate < payload.dateRange.minDate || nextDate > payload.dateRange.maxDate)
          ) {
            nextDate = "";
            nextTime = "";
          }

          if (!nextDate || (payload?.doctorDisabled ? false : !nextDoctor)) {
            nextTime = "";
          } else if (nextTime) {
            const validTime = (payload?.slots || []).some((item) => item.value === nextTime && item.available);
            if (!validTime) nextTime = "";
          }

          if (
            nextDoctor === prev.doctor
            && nextDate === prev.date
            && nextTime === prev.time
          ) {
            return prev;
          }

          return {
            ...prev,
            doctor: nextDoctor,
            date: nextDate,
            time: nextTime
          };
        });
      } catch (error) {
        if (!cancelled) {
          setStatus({ type: "error", msg: error.message || "Failed to load booking options." });
        }
      } finally {
        if (!cancelled && optionsSeqRef.current === seq) {
          setLoadingOptions(false);
        }
      }
    };

    loadOptions();

    return () => {
      cancelled = true;
    };
  }, [form.service, form.doctor, form.date]);

  const autoFillByName = async (rawName) => {
    const fullName = String(rawName || "").trim();
    if (fullName.length < 2) {
      setIsAutoFillingIdentity(false);
      return;
    }

    const currentName = normalizeName(fullName);
    const signedName = normalizeName(user?.name || "");
    if (
      signedName &&
      (signedName.includes(currentName) || currentName.includes(signedName)) &&
      (user?.patientId || user?.phone)
    ) {
      const userGender = String(user?.gender || "").trim().toLowerCase();
      const normalizedUserGender = userGender === "male" || userGender === "female" ? userGender : "";
      setForm((prev) => {
        const liveName = normalizeName(prev.name);
        if (!(signedName.includes(liveName) || liveName.includes(signedName))) return prev;
        return {
          ...prev,
          patientId: user.patientId || "",
          gender: normalizedUserGender || prev.gender || "",
          phone: user.phone || ""
        };
      });
      if (normalizedUserGender) {
        setIsAutoFillingIdentity(false);
        return;
      }
    }

    const seq = ++lookupSeqRef.current;
    try {
      setIsAutoFillingIdentity(true);
      const result = await apiFetch(`/api/patients/lookup/by-name?name=${encodeURIComponent(fullName)}`);
      if (!result?.found) return;

      setForm((prev) => {
        if (normalizeName(prev.name) !== currentName) return prev;
        return {
          ...prev,
          patientId: result.patientId || "",
          gender: result.gender || prev.gender || "",
          phone: result.phone || ""
        };
      });
    } catch {
      // Keep manual flow if lookup is unavailable.
    } finally {
      if (lookupSeqRef.current === seq) {
        setIsAutoFillingIdentity(false);
      }
    }
  };

  useEffect(() => {
    const fullName = String(form.name || "").trim();
    if (fullName.length < 2) {
      setIsAutoFillingIdentity(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      autoFillByName(fullName);
    }, 450);

    return () => clearTimeout(timer);
  }, [form.name]);

  const onChange = (event) => {
    const { name, value } = event.target;
    if (name === "cardExpiry") {
      setForm((prev) => ({ ...prev, cardExpiry: formatCardExpiryInput(value) }));
      return;
    }
    if (name === "patientId") {
      setForm((prev) => ({ ...prev, patientId: value.toUpperCase() }));
      return;
    }
    if (name === "service") {
      setStatus({ type: "idle", msg: "" });
      setForm((prev) => ({
        ...prev,
        service: value,
        doctor: "",
        time: ""
      }));
      return;
    }
    if (name === "doctor") {
      setStatus({ type: "idle", msg: "" });
      setForm((prev) => ({
        ...prev,
        doctor: value,
        time: ""
      }));
      return;
    }
    if (name === "date") {
      setStatus({ type: "idle", msg: "" });
      setForm((prev) => ({
        ...prev,
        date: value,
        time: ""
      }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const chooseTime = (timeValue) => {
    setStatus({ type: "idle", msg: "" });
    setForm((prev) => ({ ...prev, time: timeValue }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    const identityMode = form.patientId.trim() ? "id" : "name";
    const hasIdentity = form.patientId.trim() || form.name.trim();

    if (!hasIdentity || !form.phone.trim() || !form.gender || !form.date || !form.time) {
      setStatus({
        type: "error",
        msg: "Please fill Patient ID or Full Name, Gender, Phone, Date and a time slot."
      });
      return;
    }

    if (!doctorDisabled && !form.doctor.trim()) {
      setStatus({
        type: "error",
        msg: "Please choose a doctor for the selected service."
      });
      return;
    }

    if (form.paymentMethod === "card") {
      const cardDigits = form.cardNumber.replace(/\D/g, "");
      const hasValidExpiry = /^(0[1-9]|1[0-2])\/\d{2}$/.test(form.cardExpiry.trim());
      if (!form.cardHolder.trim() || cardDigits.length < 12 || !hasValidExpiry || form.cardCvv.trim().length < 3) {
        setStatus({
          type: "error",
          msg: "Enter valid card details (MM/YY) for online payment."
        });
        return;
      }
    }

    try {
      const created = await apiFetch("/api/patients/appointments", {
        method: "POST",
        body: JSON.stringify({
          patientMode: identityMode,
          patientId: form.patientId.trim(),
          name: form.name.trim(),
          age: form.age ? Number(form.age) : null,
          gender: form.gender,
          phone: form.phone.trim(),
          service: form.service,
          doctor: doctorDisabled ? "" : form.doctor,
          date: form.date,
          time: form.time,
          fee: pricing.fee,
          doctorCharge: pricing.doctorCharge,
          hospitalCharge: pricing.hospitalCharge,
          paymentMethod: form.paymentMethod,
          paymentStatus: form.paymentMethod === "card" ? "PAID" : "PENDING",
          cardLast4: form.cardNumber.replace(/\D/g, "").slice(-4),
          note: form.note.trim(),
          bookedByEmail: (user?.email || "guest@local").toLowerCase()
        })
      });

      setStatus({
        type: "success",
        msg: `Booked No: ${formatBookedNumber(created?.appointmentNumber)} | Payment: ${created?.paymentStatus || "PENDING"}${
          created?.smsNotification?.sent === true
            ? " | SMS sent"
            : created?.smsNotification?.sent === false
            ? ` | SMS failed${created?.smsNotification?.message ? `: ${created.smsNotification.message}` : ""}`
            : ""
        }`
      });

      setForm((prev) => ({
        ...prev,
        patientId: user?.patientId || "",
        name: "",
        age: "",
        gender: "",
        phone: "",
        date: "",
        time: "",
        paymentMethod: "cash",
        cardHolder: "",
        cardNumber: "",
        cardExpiry: "",
        cardCvv: "",
        note: ""
      }));
    } catch (error) {
      setStatus({
        type: "error",
        msg: `Booking failed: ${error.message}`
      });
    }
  };

  const slotHint = !form.date
    ? "Choose a date to see available 10-minute slots."
    : doctorDisabled
    ? "OPD time slots are available for the full 24 hours in 10-minute sections."
    : !form.doctor
    ? "Choose a doctor to load that doctor's available time slots."
    : loadingOptions
    ? "Loading available time slots..."
    : slotOptions.length
    ? "Select one of the available 10-minute slots below."
    : "No slots are available for the selected date.";
  const pricing = getPricing(serviceConfig);

  return (
    <div className="page echPage">
      <section className="echHero">
        <div className="container">
          <motion.div {...fadeUp(0)} className="echKicker">
            <span className="echDot" />
            <span>E-channelling</span>
          </motion.div>

          <h1 className="echTitle">
            <SplitWords text="Book Your Appointment" delay={0.08} />
          </h1>

          <motion.p {...fadeUp(0.12)} className="echSub">
            Select a service, choose an available doctor or OPD flow, then book one of the open 10-minute slots.
          </motion.p>

          <div className="echGrid">
            <motion.div className="glass echCard" {...pop(0.06)}>
              <form onSubmit={onSubmit} className="echForm">
                <div className="echTwo">
                  <div className="echField">
                    <label>Patient ID</label>
                    <input
                      name="patientId"
                      value={form.patientId}
                      onChange={onChange}
                      placeholder="Ex: BMN-10245"
                      className="echInput"
                    />
                  </div>

                  <div className="echField">
                    <label>Full Name</label>
                    <input
                      name="name"
                      value={form.name}
                      onChange={onChange}
                      onBlur={(event) => autoFillByName(event.target.value)}
                      placeholder="Your name"
                      className="echInput"
                    />
                    {isAutoFillingIdentity ? (
                      <div className="echHint">Looking up patient details...</div>
                    ) : null}
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
                    />
                  </div>

                  <div className="echField">
                    <label>Gender</label>
                    <select
                      name="gender"
                      value={form.gender}
                      onChange={onChange}
                      className="echInput"
                    >
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                </div>

                <div className="echTwo">
                  <div className="echField">
                    <label>Phone</label>
                    <input
                      name="phone"
                      value={form.phone}
                      onChange={onChange}
                      placeholder="+94..."
                      className="echInput"
                    />
                  </div>

                  <div className="echField">
                    <label>Service</label>
                    <select
                      name="service"
                      value={form.service}
                      onChange={onChange}
                      className="echInput"
                    >
                      {services.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="echTwo">
                  <div className="echField">
                    <label>Select Doctor</label>
                    <select
                      name="doctor"
                      value={doctorDisabled ? "OPD Duty Doctor" : form.doctor}
                      onChange={onChange}
                      className="echInput"
                      disabled={doctorDisabled}
                    >
                      {doctorDisabled ? (
                        <option value="OPD Duty Doctor">Not required for OPD</option>
                      ) : (
                        <>
                          <option value="">Select doctor</option>
                          {doctorOptions.map((item) => (
                            <option key={item.doctorId || item.name} value={item.name}>
                              {item.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    <div className="echHint">
                      {doctorDisabled
                        ? "OPD bookings do not require a specific doctor."
                        : doctorOptions.length
                        ? "Only doctors assigned to the selected service are shown."
                        : "No doctors are assigned to this service yet."}
                    </div>
                  </div>

                  <div className="echField">
                    <label>Preferred Date</label>
                    <input
                      type="date"
                      name="date"
                      value={form.date}
                      onChange={onChange}
                      className="echInput"
                      min={dateRange.minDate || undefined}
                      max={dateRange.maxDate || undefined}
                    />
                    <div className="echHint">
                      Booking window: <b>{dateRange.minDate || "-"} to {dateRange.maxDate || "-"}</b>
                    </div>
                  </div>
                </div>

                <div className="echField">
                  <label>Available Time Slots</label>
                  <div className="echHint">{slotHint}</div>
                  <div className="echSlotsWrap">
                    {slotOptions.map((slot) => (
                      <button
                        key={slot.value}
                        type="button"
                        className={[
                          "echSlotButton",
                          slot.available ? "" : "disabled",
                          form.time === slot.value ? "active" : ""
                        ].join(" ").trim()}
                        onClick={() => chooseTime(slot.value)}
                        disabled={!slot.available}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
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

                <div className="glass echFeeBox">
                  <div>
                    <div className="echFeeLabel">Charge Summary</div>
                    <div className="echFeeMeta">
                      Doctor fee: {formatMoney(pricing.doctorCharge)}
                    </div>
                    <div className="echFeeMeta">
                      Channeling fee: {formatMoney(pricing.hospitalCharge)}
                    </div>
                    <div className="echFeeValue">{formatMoney(pricing.fee)}</div>
                    <div className="echFeeMeta">
                      Total: {formatMoney(pricing.fee)}
                    </div>
                    <div className="echFeeMeta">
                      {serviceConfig?.name || form.service}
                      {doctorDisabled ? " | OPD duty doctor" : form.doctor ? ` | ${form.doctor}` : ""}
                    </div>
                  </div>
                </div>

                <div className="echField">
                  <label>Payment Method</label>
                  <select
                    name="paymentMethod"
                    value={form.paymentMethod}
                    onChange={onChange}
                    className="echInput"
                  >
                    <option value="cash">Cash (Pay at Hospital)</option>
                    <option value="card">Visa / Card (Pay Online)</option>
                  </select>
                </div>

                {form.paymentMethod === "card" ? (
                  <div className="echField">
                    <label>Card Details</label>
                    <div className="echTwo">
                      <input
                        name="cardHolder"
                        value={form.cardHolder}
                        onChange={onChange}
                        placeholder="Card holder name"
                        className="echInput"
                      />
                      <input
                        name="cardNumber"
                        value={form.cardNumber}
                        onChange={onChange}
                        placeholder="Card number"
                        className="echInput"
                      />
                    </div>
                    <div className="echTwo echCardRow">
                      <input
                        name="cardExpiry"
                        value={form.cardExpiry}
                        onChange={onChange}
                        placeholder="MM/YY"
                        maxLength={5}
                        className="echInput"
                      />
                      <input
                        name="cardCvv"
                        value={form.cardCvv}
                        onChange={onChange}
                        placeholder="CVV"
                        type="password"
                        className="echInput"
                      />
                    </div>
                  </div>
                ) : null}

                {status.type !== "idle" ? (
                  <div className={status.type === "success" ? "echAlert ok" : "echAlert bad"}>
                    {status.msg}
                  </div>
                ) : null}

                <button className="echSubmit" type="submit">
                  Submit Request
                </button>
              </form>
            </motion.div>

            <div className="echRight">
              <motion.div className="glass echInfo" {...pop(0.1)}>
                <div className="echInfoRow">
                  <div className="echInfoHead">Working Hours</div>
                  <div className="echInfoText">OPD: 24 hours with 10-minute booking slots</div>
                  <div className="echInfoText">Other services: doctor and clinic availability only</div>
                </div>

                <div className="echDivider" />

                <div className="echInfoRow">
                  <div className="echInfoHead">Location</div>
                  <div className="echInfoText">Nawala Junction, Colombo</div>
                </div>

                <div className="echDivider" />

                <div className="echInfoRow">
                  <div className="echInfoHead">Hotline</div>
                  <div className="echInfoText">+94 77 123 4567</div>
                </div>
              </motion.div>

              <motion.div className="glass echWhy" {...pop(0.16)}>
                <div className="echWhyTitle">Booking Rules</div>
                <div className="echWhyItem">Only one-month advance booking is allowed</div>
                <div className="echWhyItem">Booked slots are locked immediately</div>
                <div className="echWhyItem">Fees come from clinic service settings</div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
