import { useState } from "react";
import { apiFetch } from "./api.js";
import "./staff-reports.css";

function toDateInput(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateInput(d);
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateInput(d);
}

function normalizeServiceName(service) {
  const value = String(service || "").trim().toLowerCase();
  if (value === "psychology" || value === "psychiatric") return "Psychiatric";
  if (value === "physiotherapy") return "Physiotherapy";
  if (value === "counselling") return "Counselling";
  if (value === "aesthetic" || value === "aesthetics") return "Aesthetic";
  if (value === "opd") return "OPD";
  if (value === "lab testing" || value === "lab") return "Lab Testing";
  return String(service || "Other");
}

function normalizeSelectedService(service) {
  const value = String(service || "").trim().toLowerCase();
  if (!value || value === "all") return "all";
  if (value === "opd") return "OPD";
  if (value === "aesthetics" || value === "aesthetic") return "Aesthetic";
  if (value === "phsiotherapy" || value === "physiotherapy") return "Physiotherapy";
  if (value === "psycology" || value === "psychology" || value === "psychiatric") return "Psychiatric";
  if (value === "counselling") return "Counselling";
  if (value === "lab testing" || value === "lab") return "Lab Testing";
  return "all";
}

function ageToDemographicGroup(age) {
  const n = Number(age);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n <= 18) return "0-18";
  if (n <= 60) return "19-60";
  return "60+";
}

function polarToCartesian(cx, cy, radius, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function describePieSlice(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
}

function isTreatedAppointment(appt) {
  const status = String(appt?.status || "").toUpperCase();
  const paymentStatus = String(appt?.paymentStatus || "").toUpperCase();
  return status === "COMPLETED" || paymentStatus === "PAID";
}

function appointmentLabel(appt) {
  if (appt?.appointmentNumber) return String(appt.appointmentNumber);
  if (appt?.name) return String(appt.name);
  if (appt?.patientId) return String(appt.patientId);
  return "Unknown";
}

function buildFallbackOverview(appointments = [], invoices = [], from, to, selectedService = "all") {
  const targetService = normalizeSelectedService(selectedService);
  const rangedAppointments = appointments
    .filter((a) => String(a.date || "") >= from && String(a.date || "") <= to)
    .filter((a) => targetService === "all" || normalizeServiceName(a.service) === targetService);

  const filteredAppointments = rangedAppointments
    .filter((a) => String(a.status || "").toUpperCase() !== "CANCELLED")
    .sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));

  const demographics = {
    ageGroups: { "0-18": 0, "19-60": 0, "60+": 0 },
    gender: { male: 0, female: 0 },
  };

  for (const appt of filteredAppointments) {
    const group = ageToDemographicGroup(appt.age);
    if (group) demographics.ageGroups[group] += 1;

    const g = String(appt.gender || "").trim().toLowerCase();
    if (g === "female") demographics.gender.female += 1;
    else demographics.gender.male += 1;
  }

  const byApptId = new Map(filteredAppointments.map((a) => [String(a._id || ""), a]));
  const byApptNo = new Map(filteredAppointments.map((a) => [String(a.appointmentNumber || ""), a]));
  const revenueMap = new Map();
  const matchedInvoices = [];

  for (const inv of invoices) {
    const issueDate = String(inv.issueDate || "").trim();
    if (issueDate && (issueDate < from || issueDate > to)) continue;
    if (String(inv.status || "").toLowerCase() !== "finalized") continue;

    const appt =
      byApptId.get(String(inv.appointmentId || "")) ||
      byApptNo.get(String(inv.appointmentNumber || ""));
    if (!appt) continue;
    matchedInvoices.push(inv);
    const department = normalizeServiceName(appt?.service || "Other");
    revenueMap.set(department, (revenueMap.get(department) || 0) + Number(inv.total || 0));
  }

  const revenueByDepartment = [...revenueMap.entries()]
    .map(([department, revenue]) => ({ department, revenue: Number(revenue.toFixed(2)) }))
    .sort((a, b) => b.revenue - a.revenue);

  const paymentMethodDistribution = { cash: 0, card: 0 };
  for (const inv of matchedInvoices) {
    const method = String(inv.paymentMethod || "").trim().toLowerCase();
    if (method === "card") paymentMethodDistribution.card += 1;
    else paymentMethodDistribution.cash += 1;
  }

  const treatedAppointments = rangedAppointments.filter((a) => isTreatedAppointment(a));
  const cancelledAppointments = rangedAppointments.filter(
    (a) => String(a.status || "").toUpperCase() === "CANCELLED"
  );
  const pendingAppointments = rangedAppointments.filter(
    (a) => !isTreatedAppointment(a) && String(a.status || "").toUpperCase() !== "CANCELLED"
  );

  const appointmentStatusSummary = {
    treated: treatedAppointments.length,
    cancelled: cancelledAppointments.length,
    pending: pendingAppointments.length,
    treatedAppointments: treatedAppointments.slice(0, 5).map(appointmentLabel),
    cancelledAppointments: cancelledAppointments.slice(0, 5).map(appointmentLabel),
  };

  const today = to;
  const inflowStart = addDays(today, -27);
  const opdLast28 = appointments
    .filter((a) => String(a.date || "") >= inflowStart && String(a.date || "") <= today)
    .filter((a) =>
      targetService === "all"
        ? normalizeServiceName(a.service) === "OPD"
        : normalizeServiceName(a.service) === targetService
    )
    .filter((a) => String(a.status || "").toUpperCase() !== "CANCELLED");

  const dailyMap = new Map();
  for (let i = 0; i < 28; i += 1) dailyMap.set(addDays(inflowStart, i), 0);
  for (const row of opdLast28) {
    const key = String(row.date || "");
    dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
  }
  const values = [...dailyMap.values()];
  const lastWeek = values.slice(-7);
  const prevWeek = values.slice(-14, -7);
  const avgLastWeek = lastWeek.length ? lastWeek.reduce((s, n) => s + n, 0) / lastWeek.length : 0;
  const avgPrevWeek = prevWeek.length ? prevWeek.reduce((s, n) => s + n, 0) / prevWeek.length : avgLastWeek;
  const trend = (avgLastWeek - avgPrevWeek) / 7;

  const nextWeekForecast = [];
  for (let i = 1; i <= 7; i += 1) {
    nextWeekForecast.push({
      date: addDays(today, i),
      predictedInflow: Math.max(0, Math.round(avgLastWeek + trend * i)),
    });
  }

  return {
    from,
    to,
    demographics,
    revenueByDepartment,
    paymentMethodDistribution,
    appointmentStatusSummary,
    predictiveInflow: {
      basedOnService: targetService === "all" ? "OPD" : targetService,
      historicalWindowDays: 28,
      nextWeekForecast,
    },
  };
}

export default function StaffReports() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(toDateInput());
  const [service, setService] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const selectedServiceLabel = normalizeSelectedService(service) === "all" ? "OPD" : normalizeSelectedService(service);

  const loadReports = async (forcedService) => {
    const serviceValue = typeof forcedService === "string" ? forcedService : service;
    try {
      setLoading(true);
      setError("");
      try {
        const [appointmentsRes, invoicesRes] = await Promise.allSettled([
          apiFetch("/api/echanneling/appointments"),
          apiFetch("/api/invoices"),
        ]);
        const appointments = appointmentsRes.status === "fulfilled" && Array.isArray(appointmentsRes.value)
          ? appointmentsRes.value
          : [];
        const invoices = invoicesRes.status === "fulfilled" && Array.isArray(invoicesRes.value)
          ? invoicesRes.value
          : [];

        setData(buildFallbackOverview(appointments, invoices, from, to, serviceValue));
      } catch {
        const result = await apiFetch(
          `/api/staff/reports/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&service=${encodeURIComponent(serviceValue)}`
        );
        setData(result);
      }
    } catch (err) {
      setError(err.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page staffReportsPage">
      <div className="container staffReports">
        <div className="staffReportsTop">
          <h2>Reports</h2>
          <div className="staffReportsFilters">
            <label>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label>
              Services
              <select
                value={service}
                onChange={(e) => {
                  const nextService = e.target.value;
                  setService(nextService);
                  loadReports(nextService);
                }}
              >
                <option value="all">All</option>
                <option value="OPD">OPD</option>
                <option value="Aesthetic">Aesthetics</option>
                <option value="Physiotherapy">Phsiotherapy</option>
                <option value="Psychiatric">Psycology</option>
                <option value="Counselling">Counselling</option>
                <option value="Lab Testing">Lab Testing</option>
              </select>
            </label>
            <button className="btnPrimary" type="button" onClick={loadReports} disabled={loading}>
              {loading ? "Loading..." : "Generate"}
            </button>
          </div>
        </div>

        {error ? <p className="staffReportsError">{error}</p> : null}
        {!data && !error ? <p className="staffReportsHint">Select a date range and click Generate.</p> : null}

        {data ? (
          <div className="staffReportsGrid">
            {(() => {
              const treatedCount = Number(data.appointmentStatusSummary?.treated || 0);
              const cancelledCount = Number(data.appointmentStatusSummary?.cancelled || 0);
              const pendingCount = Number(data.appointmentStatusSummary?.pending || 0);
              const treatedList = Array.isArray(data.appointmentStatusSummary?.treatedAppointments)
                ? data.appointmentStatusSummary.treatedAppointments
                : [];
              const cancelledList = Array.isArray(data.appointmentStatusSummary?.cancelledAppointments)
                ? data.appointmentStatusSummary.cancelledAppointments
                : [];
              return (
                <>
            <section className="glass reportCard">
              <h3>Patient Demographics</h3>
              <div className="splitCols">
                <div>
                  <h4>Age Groups</h4>
                  {(() => {
                    const ageRows = [
                      { label: "0-18", value: Number(data.demographics?.ageGroups?.["0-18"] || 0) },
                      { label: "19-60", value: Number(data.demographics?.ageGroups?.["19-60"] || 0) },
                      { label: "60+", value: Number(data.demographics?.ageGroups?.["60+"] || 0) },
                    ];
                    const max = Math.max(1, ...ageRows.map((x) => x.value));
                    return (
                      <div className="miniBars">
                        {ageRows.map((row) => (
                          <div key={row.label} className="miniBarCol">
                            <div
                              className="miniBarFill age"
                              style={{ height: `${Math.max(6, Math.round((row.value / max) * 120))}px` }}
                              title={`${row.label}: ${row.value}`}
                            />
                            <div className="miniBarLabel">{row.label}</div>
                            <div className="miniBarValue">{row.value}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <h4>Gender Distribution</h4>
                  {(() => {
                    const genderRows = [
                      { label: "Male", value: Number(data.demographics?.gender?.male || 0), cls: "male" },
                      { label: "Female", value: Number(data.demographics?.gender?.female || 0), cls: "female" },
                    ];
                    const top = Math.max(1, ...genderRows.map((x) => x.value));
                    return (
                      <div className="genderBars">
                        {genderRows.map((row) => (
                          <div key={row.label} className="genderRow">
                            <span className="genderLabel">{row.label}</span>
                            <div className="genderTrack">
                              <div
                                className={`genderFill ${row.cls}`}
                                style={{ width: `${Math.max(4, Math.round((row.value / top) * 100))}%` }}
                                title={`${row.label}: ${row.value}`}
                              />
                            </div>
                            <span className="genderValue">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </section>

            <section className="glass reportCard">
              <h3>Revenue by Department</h3>
              <div className="barsWrap">
                {(data.revenueByDepartment || []).length ? (
                  data.revenueByDepartment.map((row) => {
                    const top = (data.revenueByDepartment || [])[0]?.revenue || 1;
                    const width = Math.max(4, Math.round((Number(row.revenue || 0) / top) * 100));
                    return (
                      <div key={row.department} className="barRow">
                        <span className="barLabel">{row.department}</span>
                        <div className="barTrack">
                          <div className="barFill" style={{ width: `${width}%` }} />
                        </div>
                        <span className="barValue">LKR {Number(row.revenue || 0).toLocaleString()}</span>
                      </div>
                    );
                  })
                ) : (
                  <p className="staffReportsHint">No revenue data for selected range.</p>
                )}
              </div>
            </section>

            <section className="glass reportCard">
              <h3>Payment Method Distribution</h3>
              {(() => {
                const cash = Number(data.paymentMethodDistribution?.cash || 0);
                const card = Number(data.paymentMethodDistribution?.card || 0);
                const total = cash + card;
                const cashPct = total ? Math.round((cash / total) * 100) : 0;
                const cardPct = total ? 100 - cashPct : 0;
                const cashIsLargest = cash >= card;
                const cashDotSize = cashIsLargest ? 44 : 10;
                const cardDotSize = cashIsLargest ? 10 : 44;
                const cx = 100;
                const cy = 100;
                const r = 78;
                const cashAngle = total ? (cash / total) * 360 : 0;
                const cashPath = describePieSlice(cx, cy, r, 0, cashAngle);
                const cardPath = describePieSlice(cx, cy, r, cashAngle, 360);
                const cashOnly = total > 0 && cash === total;
                const cardOnly = total > 0 && card === total;
                return (
                  <div className="payDistWrap">
                    <div className="payPieSvgWrap" aria-label="Payment method split chart">
                      <svg viewBox="0 0 260 210" className="payPieSvg">
                        <g>
                          {total > 0 ? (
                            <>
                              {cashOnly ? <circle cx={cx} cy={cy} r={r} className="pieArea cash" /> : null}
                              {cardOnly ? <circle cx={cx} cy={cy} r={r} className="pieArea card" /> : null}
                              {!cashOnly && !cardOnly && cash > 0 ? <path d={cashPath} className="pieArea cash" /> : null}
                              {!cashOnly && !cardOnly && card > 0 ? <path d={cardPath} className="pieArea card" /> : null}
                            </>
                          ) : (
                            <circle cx={cx} cy={cy} r={r} className="pieArea empty" />
                          )}
                        </g>
                      </svg>
                    </div>
                    <div className="payLegend">
                      <div>
                        <span
                          className="payLegendBubble cash"
                          style={{
                            width: `${cashDotSize}px`,
                            height: `${cashDotSize}px`,
                            boxShadow: cashIsLargest ? "inset 0 0 0 5px rgba(255, 255, 255, 0.35)" : "none",
                          }}
                        />
                        Cash: <strong>{cash}</strong> ({cashPct}%)
                      </div>
                      <div>
                        <span
                          className="payLegendBubble card"
                          style={{
                            width: `${cardDotSize}px`,
                            height: `${cardDotSize}px`,
                            boxShadow: !cashIsLargest ? "inset 0 0 0 5px rgba(255, 255, 255, 0.35)" : "none",
                          }}
                        />
                        Card: <strong>{card}</strong> ({cardPct}%)
                      </div>
                    </div>
                  </div>
                );
              })()}
            </section>
            <section className="glass reportCard">
              <h3>Appointment Status Summary</h3>
              <div className="apptStatusSummary">
                <div>Treated: <strong>{treatedCount}</strong></div>
                <div>Cancelled: <strong>{cancelledCount}</strong></div>
                <div>Pending: <strong>{pendingCount}</strong></div>
                <div>
                  Treated appointments: <strong>{treatedList.length ? treatedList.join(", ") : "None"}</strong>
                </div>
                <div>
                  Cancelled appointments: <strong>{cancelledList.length ? cancelledList.join(", ") : "None"}</strong>
                </div>
              </div>
            </section>

            <section className="glass reportCard wide">
              <h3>Predictive Patient Inflow (Next 7 Days)</h3>
              <p className="staffReportsHint">
                Based on {selectedServiceLabel} history (
                {data.predictiveInflow?.historicalWindowDays || 0} days).
              </p>
              <div className="forecastGrid">
                {(data.predictiveInflow?.nextWeekForecast || []).map((row) => (
                  <div key={row.date} className="forecastCard">
                    <div className="forecastDate">{row.date}</div>
                    <div className="forecastValue">{row.predictedInflow}</div>
                    <div className="forecastText">patients</div>
                  </div>
                ))}
              </div>
            </section>
                </>
              );
            })()}
          </div>
        ) : null}
      </div>
    </div>
  );
}
