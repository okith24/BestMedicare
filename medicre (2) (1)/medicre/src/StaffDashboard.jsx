import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import "./StaffDashboard.css";
import { useAuth } from "./auth/AuthContext.jsx";

const ease = [0.22, 1, 0.36, 1];

const appointmentsSeed = [
  { apt: "APT001", patientId: "P001", patient: "John Silva", category: "OPD", doctor: "Dr. A. Perera", date: "2026-02-10" },
  { apt: "APT002", patientId: "P002", patient: "Nimali Fernando", category: "Aesthetic", doctor: "Dr. R. Fernando", date: "2026-02-11" },
  { apt: "APT003", patientId: "P003", patient: "Kasun Jayasekara", category: "Psychiatric", doctor: "Dr. N. Silva", date: "2026-02-10" },
  { apt: "APT004", patientId: "P004", patient: "Shehan Perera", category: "Counselling", doctor: "Dr. M. Kumara", date: "2026-02-10" },
  { apt: "APT005", patientId: "P005", patient: "Ishara Silva", category: "Physiotherapy", doctor: "Dr. S. Jayasinghe", date: "2026-02-10" },
];

export default function StaffDashboard() {
  const { user, signOut } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All Categories");
  const [doc, setDoc] = useState("All Doctors");
  const [d, setD] = useState("");

  const allDoctors = useMemo(() => {
    const set = new Set(appointmentsSeed.map((a) => a.doctor));
    return ["All Doctors", ...Array.from(set)];
  }, []);

  const categories = ["All Categories", "OPD", "Aesthetic", "Psychiatric", "Counselling", "Physiotherapy"];

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return appointmentsSeed.filter((a) => {
      const matchQ =
        !query ||
        a.patientId.toLowerCase().includes(query) ||
        a.patient.toLowerCase().includes(query) ||
        a.apt.toLowerCase().includes(query);

      const matchCat = cat === "All Categories" || a.category === cat;
      const matchDoc = doc === "All Doctors" || a.doctor === doc;
      const matchDate = !d || a.date === d;

      return matchQ && matchCat && matchDoc && matchDate;
    });
  }, [q, cat, doc, d]);

  const counts = useMemo(() => {
    const base = { OPD: 0, Aesthetic: 0, Psychiatric: 0, Counselling: 0, Physiotherapy: 0 };
    appointmentsSeed.forEach((a) => { if (base[a.category] !== undefined) base[a.category]++; });
    return base;
  }, []);

  const treatedToday = useMemo(() => appointmentsSeed.filter((a) => a.date === today).length, [today]);

  return (
    <div className="sdPage">
      <div className="sdGlow" />

      <div className="container sdWrap">
        <motion.div
          className="sdTop"
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease }}
        >
          <div>
            <button className="sdBack" onClick={() => history.back()}>← Back</button>
            <h1 className="sdTitle">Welcome back, {user?.name?.trim() ? user.name : "Staff Member"} 👋</h1>
            <div className="sdMeta">Today • Shift starts at 08:00 AM</div>
          </div>

          <div className="sdTopActions">
            <button className="sdBtnPrimary">+ New Admission</button>
            <button className="sdBtnGhost">View Full Stats</button>
            <button className="sdBtnGhost" onClick={signOut}>Logout</button>
          </div>
        </motion.div>

        <motion.div
          className="glass sdBigCard"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease }}
        >
          <div className="sdBigLabel">Patients Treated Today</div>
          <div className="sdBigValue">
            {treatedToday} <span className="sdUp">+12%</span>
          </div>
          <div className="sdBigSub">Target reached: 92% of daily capacity</div>
        </motion.div>

        <div className="sdRow">
          {[
            ["OPD", counts.OPD],
            ["Aesthetic", counts.Aesthetic],
            ["Psychiatric", counts.Psychiatric],
            ["Counselling", counts.Counselling],
            ["Physiotherapy", counts.Physiotherapy],
          ].map(([label, val], i) => (
            <motion.div
              key={label}
              className="glass sdMini"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08 + i * 0.05, ease }}
            >
              <div className="sdMiniTop">
                <div className="sdMiniTitle">{label}</div>
                <div className="sdMiniNum">{val}</div>
              </div>
              <div className="sdBar">
                <div className="sdBarFill" style={{ width: `${Math.min(100, val * 12)}%` }} />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="sdGrid2">
          <motion.div className="glass sdTableCard" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.10, ease }}>
            <div className="sdCardHead">
              <div className="sdCardTitle">Search Appointments</div>
            </div>

            <div className="sdFilters">
              <input className="sdInput" placeholder="Patient ID or Name" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="sdSelect" value={cat} onChange={(e) => setCat(e.target.value)}>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select className="sdSelect" value={doc} onChange={(e) => setDoc(e.target.value)}>
                {allDoctors.map((x) => <option key={x}>{x}</option>)}
              </select>
              <input className="sdInput" type="date" value={d} onChange={(e) => setD(e.target.value)} />
            </div>

            <div className="sdTable">
              <div className="sdTh">
                <div>Patient ID</div>
                <div>Patient</div>
                <div>Category</div>
                <div>Doctor</div>
                <div>Date</div>
              </div>

              {filtered.map((a) => (
                <div className="sdTr" key={a.apt}>
                  <div className="sdMono">{a.patientId}</div>
                  <div>{a.patient}</div>
                  <div>{a.category}</div>
                  <div>{a.doctor}</div>
                  <div className="sdMono">{a.date}</div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="sdEmpty">No results found 😶‍🌫️</div>
              )}
            </div>
          </motion.div>

          <motion.div className="glass sdReport" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.14, ease }}>
            <div className="sdCardTitle">Generate Report</div>
            <div className="sdSmall">Select Date</div>
            <input className="sdInput" type="date" />
            <button className="sdBtnPrimary" style={{ marginTop: 12 }}>Generate</button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
