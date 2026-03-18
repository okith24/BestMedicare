import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth/AuthContext.jsx";
import { apiFetch } from "./api.js";
import "./PatientDashboard.css";

function niceDate(date) {
  if (!date) return "-";
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function niceTime(time) {
  if (!time) return "-";
  if (time.includes("AM") || time.includes("PM")) return time;
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function PatientDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError("");
      const data = await apiFetch("/api/patients/dashboard");
      setSummary(data);
    } catch (err) {
      setError(err.message || "Failed to load dashboard");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadSummary(false);
    const timer = setInterval(() => loadSummary(true), 5000);
    return () => clearInterval(timer);
  }, [user, loadSummary]);

  const records = useMemo(() => summary?.records || [], [summary]);
  const invoices = useMemo(() => summary?.invoices || [], [summary]);
  const upcoming = summary?.upcoming || null;
  const loyalty = summary?.loyalty || { visitsCount: 0, starPoints: 0, nextStarIn: 10 };
  const patientId = summary?.user?.patientId || user?.patientId || "-";

  return (
    <div className="page pdPage">
      <div className="container">
        <div className="pdTop">
          <div className="pdIntro">
            <div className="pdWelcome">
              Welcome, <span className="pdName">{user?.name || "Patient"}</span>
            </div>
            <div className="pdSub">
              Your appointments, payment status, and finalized bills are shown here.
            </div>
          </div>

          <div className="pdTopCards">
            <div className="glass pdLoyalty pdTopCard">
              <div className="pdLoyaltySmall">LOYALTY STATUS</div>
              <div className="pdLoyaltyRow">
                <div className="pdPoints">{loyalty.starPoints}</div>
                <div className="pdPointsTxt">star points</div>
              </div>
              <div className="pdMiniLink">
                Visits: <b>{loyalty.visitsCount}</b> | Next star in <b>{loyalty.nextStarIn}</b> visits
              </div>
            </div>

            <div className="glass pdIdentityBox pdTopCard">
              <div className="pdLoyaltySmall">PATIENT ID</div>
              <div className="pdIdentityValue">{patientId}</div>
              <div className="pdMiniLink">Use this ID for billing and support.</div>
            </div>
          </div>
        </div>

        {error && <div className="pdEmpty">{error}</div>}

        <div className="pdGrid">
          <div className="glass pdCard">
            <div className="pdCardHead">
              <div className="pdCardTitle">My Appointments</div>
              {upcoming && (
                <div className="pdMiniLink">
                  Next: <b>{niceDate(upcoming.date)}</b> - <b>{niceTime(upcoming.time)}</b>
                </div>
              )}
            </div>

            <div className="pdList">
              {!loading && records.length === 0 ? (
                <div className="pdEmpty">No appointments yet. Book from E-channelling.</div>
              ) : (
                records.slice(0, 6).map((a) => (
                  <div key={a.id} className="pdAppt">
                    <div className="pdApptLeft">
                      <div className="pdDoc">{a.doctor || "Doctor"}</div>
                      <div className="pdMeta">
                        <span>{a.appointmentNumber || "-"}</span>
                        <span>{niceDate(a.date)}</span>
                        <span>{niceTime(a.time)}</span>
                        <span className="pdTag">{a.service}</span>
                        <span className="pdTag">{a.status}</span>
                      </div>
                    </div>

                    <div className="pdApptRight">
                      <span className={a.paymentStatus === "PAID" ? "pdBadge paid" : "pdBadge pending"}>
                        {a.paymentStatus === "PAID" ? "PAID" : "PENDING"}
                      </span>

                      {a.paymentStatus !== "PAID" && a.paymentMethod !== "card" && (
                        <span className="pdCashHint">Cash payment pending</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass pdCard">
            <div className="pdCardHead">
              <div className="pdCardTitle">Final Bill History</div>
            </div>

            <div className="pdTable">
              <div className="pdTr pdTh pdTr6">
                <div>Reference</div>
                <div>Date</div>
                <div>Appointment</div>
                <div>Amount</div>
                <div>Method</div>
                <div>Status</div>
              </div>

              {!loading && invoices.length === 0 ? (
                <div className="pdEmptyRow">No finalized bills yet.</div>
              ) : (
                invoices.slice(0, 8).map((inv) => (
                  <div key={inv.id} className="pdTr pdTr6">
                    <div>{inv.referenceNumber}</div>
                    <div>{niceDate(inv.issueDate)}</div>
                    <div className="pdDoctorCell">{inv.appointmentNumber || "-"}</div>
                    <div className="pdAmt">Rs. {(inv.total || 0).toLocaleString()}</div>
                    <div className="pdDoctorCell">{(inv.paymentMethod || "-").toUpperCase()}</div>
                    <div>
                      <span className={inv.paymentStatus === "PAID" ? "pdBadge paid" : "pdBadge pending"}>
                        {inv.paymentStatus}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pdFootNote">
              Bills are view-only for patients. Only staff can edit and finalize billing.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
