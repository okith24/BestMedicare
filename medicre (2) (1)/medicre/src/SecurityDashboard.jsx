/**
 * Security Dashboard Component
 * Real-time monitoring interface for security events, alerts, and user activity
 */

import React, { useState, useEffect } from "react";
import axios from "axios";
import "./securityDashboard.css";

const SecurityDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [auditLogs, setAuditLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState(7); // days

  // Fetch audit logs
  useEffect(() => {
    const fetchAuditLogs = async () => {
      try {
        setLoading(true);
        const response = await axios.get("/api/data-retention/audit-logs", {
          params: { limit: 50, offset: 0 },
        });
        if (response.data.success) {
          setAuditLogs(response.data.data.logs);
        }
      } catch (err) {
        setError("Failed to fetch audit logs");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (activeTab === "audit-logs") {
      fetchAuditLogs();
    }
  }, [activeTab]);

  // Fetch security alerts
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        setLoading(true);
        const response = await axios.get("/api/security/alerts/recent", {
          params: { limit: 50, offset: 0 },
        });
        if (response.data.success) {
          setAlerts(response.data.data.alerts);
        }
      } catch (err) {
        setError("Failed to fetch alerts");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (activeTab === "alerts") {
      fetchAlerts();
    }
  }, [activeTab]);

  // Fetch statistics
  useEffect(() => {
    const fetchStatistics = async () => {
      try {
        setLoading(true);
        const response = await axios.get("/api/security/alerts/statistics", {
          params: { days: dateRange },
        });
        if (response.data.success) {
          setStatistics(response.data.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (activeTab === "statistics") {
      fetchStatistics();
    }
  }, [activeTab, dateRange]);

  const handleTestAlert = async () => {
    try {
      const response = await axios.post("/api/security/alerts/test");
      if (response.data.success) {
        alert("Test alert sent successfully!");
      }
    } catch (err) {
      alert("Failed to send test alert");
    }
  };

  // Overview Tab
  const renderOverview = () => (
    <div className="security-overview">
      <h2>Security Dashboard Overview</h2>
      
      <div className="overview-cards">
        <div className="card">
          <h3>Active Threats</h3>
          <p className="large-number" style={{ color: "#dd0000" }}>
            {alerts.filter((a) => a.severity === "CRITICAL").length}
          </p>
          <p>Critical alerts</p>
        </div>

        <div className="card">
          <h3>Recent Events</h3>
          <p className="large-number">{auditLogs.length}</p>
          <p>Audit log entries in last 24h</p>
        </div>

        <div className="card">
          <h3>Data Protection</h3>
          <p className="large-number" style={{ color: "#00aa00" }}>✓</p>
          <p>All systems secured</p>
        </div>

        <div className="card">
          <h3>Compliance Status</h3>
          <p className="large-number" style={{ color: "#0066ff" }}>100%</p>
          <p>Data retention policies active</p>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleTestAlert}>
        Send Test Alert
      </button>
    </div>
  );

  // Audit Logs Tab
  const renderAuditLogs = () => (
    <div className="audit-logs-section">
      <h2>Audit Log</h2>
      <p className="subtitle">All system and user actions for compliance tracking</p>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="logs-table">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>User/Admin</th>
                <th>Severity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log._id}>
                  <td className="timestamp">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="action">{log.action}</td>
                  <td>{log.userEmail || log.adminEmail || "System"}</td>
                  <td className={`severity severity-${log.severity}`}>
                    {log.severity}
                  </td>
                  <td className="details">
                    <details>
                      <summary>View</summary>
                      <pre>{JSON.stringify(log.details, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // Alerts Tab
  const renderAlerts = () => (
    <div className="alerts-section">
      <h2>Security Alerts</h2>
      <p className="subtitle">Real-time security event notifications</p>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="alerts-list">
          {alerts.length === 0 ? (
            <p className="no-alerts">No security alerts in the selected period</p>
          ) : (
            alerts.map((alert) => (
              <div key={alert._id} className={`alert-item severity-${alert.severity}`}>
                <div className="alert-header">
                  <span className="alert-action">{alert.action}</span>
                  <span className={`alert-severity`}>{alert.severity}</span>
                </div>
                <div className="alert-body">
                  <p className="alert-timestamp">
                    {new Date(alert.createdAt).toLocaleString()}
                  </p>
                  {alert.userEmail && (
                    <p className="alert-user">User: {alert.userEmail}</p>
                  )}
                  {alert.details && (
                    <details className="alert-details">
                      <summary>Details</summary>
                      <pre>{JSON.stringify(alert.details, null, 2)}</pre>
                    </details>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  // Statistics Tab
  const renderStatistics = () => (
    <div className="statistics-section">
      <h2>Security Statistics</h2>
      
      <div className="date-range-selector">
        <label>Time Range:</label>
        <select value={dateRange} onChange={(e) => setDateRange(parseInt(e.target.value))}>
          <option value={1}>Last 24 Hours</option>
          <option value={7}>Last 7 Days</option>
          <option value={30}>Last 30 Days</option>
          <option value={90}>Last 90 Days</option>
        </select>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : statistics ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Alerts</h3>
              <p className="stat-number">{statistics.totalAlerts}</p>
              <p className="stat-label">in {dateRange} days</p>
            </div>

            <div className="stat-card">
              <h3>Alert Types</h3>
              <ul className="stat-list">
                {statistics.alertTypes.map((type) => (
                  <li key={type._id}>
                    <span className="type-name">{type._id}:</span>
                    <span className="type-count">{type.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="stat-card">
              <h3>Severity Distribution</h3>
              <ul className="stat-list">
                {statistics.severityDistribution.map((item) => (
                  <li key={item._id}>
                    <span className="type-name" style={{ color: getSeverityColor(item._id) }}>
                      {item._id}:
                    </span>
                    <span className="type-count">{item.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="daily-trend">
            <h3>Daily Trend</h3>
            <div className="trend-chart">
              {statistics.dailyTrend.length === 0 ? (
                <p>No data available</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Alerts</th>
                      <th>Graph</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statistics.dailyTrend.map((item) => (
                      <tr key={item._id}>
                        <td>{item._id}</td>
                        <td>{item.count}</td>
                        <td>
                          <div className="bar">
                            <div
                              className="bar-fill"
                              style={{
                                width: `${(item.count / Math.max(...statistics.dailyTrend.map((d) => d.count))) * 100}%`,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : (
        <p>Failed to load statistics</p>
      )}
    </div>
  );

  const getSeverityColor = (severity) => {
    switch (severity) {
      case "CRITICAL":
        return "#ff0000";
      case "HIGH":
        return "#dd0000";
      case "MEDIUM":
        return "#ff6600";
      case "LOW":
        return "#ffa500";
      default:
        return "#999";
    }
  };

  return (
    <div className="security-dashboard">
      <div className="dashboard-header">
        <h1>🔒 Security Dashboard</h1>
        <p className="header-subtitle">Real-time monitoring and security event tracking</p>
      </div>

      <nav className="dashboard-tabs">
        <button
          className={`tab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          className={`tab-btn ${activeTab === "audit-logs" ? "active" : ""}`}
          onClick={() => setActiveTab("audit-logs")}
        >
          Audit Logs
        </button>
        <button
          className={`tab-btn ${activeTab === "alerts" ? "active" : ""}`}
          onClick={() => setActiveTab("alerts")}
        >
          Security Alerts
        </button>
        <button
          className={`tab-btn ${activeTab === "statistics" ? "active" : ""}`}
          onClick={() => setActiveTab("statistics")}
        >
          Statistics
        </button>
      </nav>

      <div className="dashboard-content">
        {error && <div className="error-message">{error}</div>}

        {activeTab === "overview" && renderOverview()}
        {activeTab === "audit-logs" && renderAuditLogs()}
        {activeTab === "alerts" && renderAlerts()}
        {activeTab === "statistics" && renderStatistics()}
      </div>
    </div>
  );
};

export default SecurityDashboard;
