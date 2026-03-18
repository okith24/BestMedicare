import { useEffect, useMemo, useState } from "react";

function monthValue(date = new Date()) {
  return new Date(date).toISOString().slice(0, 7);
}

function dateValue(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

export default function ReportGenerator({
  onGenerateMonthly,
  onGenerateDaily,
  monthlyReport,
  dailyReport,
  loadingMonthly = false,
  loadingDaily = false,
}) {
  const [month, setMonth] = useState(monthValue());
  const [date, setDate] = useState(dateValue());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!onGenerateMonthly) return;
    onGenerateMonthly(month).catch((err) => {
      setError(err?.message || "Failed to load monthly report");
    });
  }, [month, onGenerateMonthly]);

  useEffect(() => {
    if (!onGenerateDaily) return;
    onGenerateDaily(date).catch((err) => {
      setError(err?.message || "Failed to load report");
    });
  }, [date, onGenerateDaily]);

  const byServiceText = useMemo(() => {
    if (!monthlyReport?.byService?.length) return "No service data for this month.";
    return monthlyReport.byService.map((row) => `${row.service}: ${row.count}`).join(" | ");
  }, [monthlyReport]);

  const monthlyTotals = monthlyReport?.totals || {};
  const dailyTotals = dailyReport?.totals || {};

  return (
    <div className="glass card">
      <h3>Daily & Monthly Appointment Report</h3>

      <label>Select Day</label>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      <button
        className="btnPrimary report-btn"
        type="button"
        onClick={() => {
          if (!onGenerateDaily) return;
          setError("");
          onGenerateDaily(date).catch((err) => {
            setError(err?.message || "Failed to load daily report");
          });
        }}
        disabled={loadingDaily}
      >
        {loadingDaily ? "Loading Day..." : "Generate Daily"}
      </button>

      {dailyReport && (
        <div className="report-summary">
          <p>Date: <strong>{dailyReport.date}</strong></p>
          <p>Treated: <strong>{dailyTotals.treated || 0}</strong></p>
          <p>Cancelled: <strong>{dailyTotals.cancelled || 0}</strong></p>
          <p>Pending: <strong>{dailyTotals.pending || 0}</strong></p>
          <p>
            Treated appointments:{" "}
            <strong>
              {(dailyReport.treatedAppointments || [])
                .slice(0, 8)
                .map((a) => a.appointmentNumber || a.patientId || a.patientName || "-")
                .join(", ") || "None"}
            </strong>
          </p>
          <p>
            Cancelled appointments:{" "}
            <strong>
              {(dailyReport.cancelledAppointments || [])
                .slice(0, 8)
                .map((a) => a.appointmentNumber || a.patientId || a.patientName || "-")
                .join(", ") || "None"}
            </strong>
          </p>
        </div>
      )}

      <label style={{ marginTop: 10, display: "block" }}>Select Month</label>
      <input
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
      />

      <button
        className="btnPrimary report-btn"
        type="button"
        onClick={() => {
          if (!onGenerateMonthly) return;
          setError("");
          onGenerateMonthly(month).catch((err) => {
            setError(err?.message || "Failed to load monthly report");
          });
        }}
        disabled={loadingMonthly}
      >
        {loadingMonthly ? "Loading Month..." : "Generate Monthly"}
      </button>

      {error && <p className="no-results">{error}</p>}

      {monthlyReport && (
        <div className="report-summary">
          <p>Total appointments: <strong>{monthlyTotals.totalAppointments || 0}</strong></p>
          <p>Treated: <strong>{monthlyTotals.treated || 0}</strong></p>
          <p>Cancelled: <strong>{monthlyTotals.cancelled || 0}</strong></p>
          <p>Paid: <strong>{monthlyTotals.paid || 0}</strong> | Pending: <strong>{monthlyTotals.pending || 0}</strong></p>
          <p>Total revenue: <strong>LKR {(monthlyTotals.totalRevenue || 0).toLocaleString()}</strong></p>
          <p>{byServiceText}</p>
        </div>
      )}
    </div>
  );
}
