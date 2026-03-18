import "./dashboard.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import StatCard from "./StatCard";
import DepartmentCard from "./DepartmentCard";
import ClientList from "./ClientList";
import AppointmentSearch from "./AppointmentSearch";
import { apiFetch } from "./api.js";
import ChatbotLauncher from "./ChatbotLauncher.jsx";

function prettyDate(date) {
  const d = date ? new Date(`${date}T00:00:00`) : new Date();
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState("");

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  const loadDashboard = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setIsFetching(true);
      setError("");
      const data = await apiFetch(`/api/staff/dashboard?date=${selectedDate}`);
      setDashboard(data);
    } catch (err) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      if (!silent) setLoading(false);
      setIsFetching(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadDashboard(false);
    const timer = setInterval(() => loadDashboard(true), 10000);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  const handleCancel = async (id) => {
    try {
      setCancellingId(id);
      await apiFetch(`/api/staff/appointments/${id}/cancel`, { method: "PATCH" });
      await loadDashboard(false);
    } catch (err) {
      setError(err.message || "Failed to cancel appointment");
    } finally {
      setCancellingId("");
    }
  };

  const overview = dashboard?.overview || {
    treatedToday: 0,
    totalAppointmentsToday: 0,
    growthPercent: 0,
  };

  const growthText = `${overview.growthPercent >= 0 ? "+" : ""}${overview.growthPercent}%`;
  const appointments = dashboard?.appointments || [];
  const departments = useMemo(
    () => (dashboard?.departments || []).sort((a, b) => b.count - a.count),
    [dashboard]
  );
  const shiftText = `Signed in as ${user?.email || "staff@hospital.com"}`;

  // Build the weekly range label from backend data
  const weeklyRangeLabel = useMemo(() => {
    const wr = dashboard?.weeklyRange;
    if (!wr?.start || !wr?.end) return null;
    const fmt = (dateStr) =>
      new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    return `Showing week: ${fmt(wr.start)} – ${fmt(wr.end)}`;
  }, [dashboard]);

  return (
    <div className="page">
      <div className="container dashboard">
        <header className="header">
          <div className="header-top">
            <button
              className="btnGhost back-btn"
              onClick={() => navigate(-1)}
              type="button"
            >
              Back
            </button>
          </div>

          <h1>{`Welcome back, ${user?.name || "Staff"}`}</h1>
          <p>{`${prettyDate(dashboard?.date)} - ${shiftText}`}</p>

          <div className="header-actions">
            <div className="header-actions__buttons">
              <button
                className="btnPrimary"
                onClick={() => navigate("/echanneling")}
                type="button"
              >
                + New Admission
              </button>
              <button className="btnGhost" onClick={() => navigate("/invoice")} type="button">
                Billing Invoice
              </button>
              <button className="btnGhost" onClick={() => navigate("/staff/reports")} type="button">
                Reports
              </button>
            </div>
            <ChatbotLauncher variant="header" />
          </div>

          {loading && <p className="connection-status">Loading staff dashboard...</p>}
          {error && <p className="connection-status">{error}</p>}
        </header>

        <div className="stats-grid">
          <StatCard
            title={selectedDate === new Date().toISOString().slice(0, 10) ? "Patients Treated Today" : "Patients Treated"}
            value={overview.treatedToday}
            growth={growthText}
            subtitle={`${overview.totalAppointmentsToday || 0} appointments scheduled`}
          />
        </div>

        <div className="department-header">
            <p className="department-scope">Department summary</p>
            <div className="date-filter">
                <label htmlFor="dashboard-date">Select Date:</label>
                <input 
                    type="date" 
                    id="dashboard-date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="date-picker-input"
                />
                {isFetching && <span className="date-filter__spinner" aria-label="Loading" />}
            </div>
        </div>
        {weeklyRangeLabel && (
          <p className="weekly-range-label">{weeklyRangeLabel}</p>
        )}
        
        <div className={`department-grid${isFetching ? " department-grid--fetching" : ""}`}>
          {departments.length > 0 ? (
            departments.map((item) => (
              <DepartmentCard key={item.name} title={item.name} value={item.count} />
            ))
          ) : (
            <div className="glass card no-results">No department activity for selected weekly range.</div>
          )}
        </div>

        <div className="dashboard-grid">
          <AppointmentSearch
            appointments={appointments}
            onCancel={handleCancel}
            cancellingId={cancellingId}
          />
        </div>

        <ClientList clients={dashboard?.mostVisited || []} />
      </div>
    </div>
  );
}
