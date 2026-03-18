import { useMemo, useState } from "react";

export default function AppointmentSearch({
  appointments = [],
  onCancel,
  cancellingId = "",
}) {
  const [searchText, setSearchText] = useState("");
  const [category, setCategory] = useState("");
  const [doctor, setDoctor] = useState("");
  const [date, setDate] = useState("");

  const categories = useMemo(
    () => [...new Set(appointments.map((a) => a.service).filter(Boolean))],
    [appointments]
  );
  const doctors = useMemo(
    () => [...new Set(appointments.map((a) => a.doctor).filter(Boolean))],
    [appointments]
  );

  const filteredAppointments = useMemo(
    () =>
      appointments.filter((a) => {
        const key = `${a.appointmentNumber || ""} ${a.patientName || ""} ${a.patientId || ""}`.toLowerCase();
        return (
          (searchText.trim() === "" || key.includes(searchText.trim().toLowerCase())) &&
          (category === "" || a.service === category) &&
          (doctor === "" || a.doctor === doctor) &&
          (date === "" || a.date === date)
        );
      }),
    [appointments, searchText, category, doctor, date]
  );

  return (
    <div className="glass card appointmentSearchCard">
      <h3>Search Appointments</h3>

      <div className="appointment-filters">
        <input
          type="text"
          placeholder="Appointment No, Patient ID or Name"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />

        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
          <option value="">All Doctors</option>
          {doctors.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <table>
        <thead>
          <tr>
            <th>Appointment No</th>
            <th>Patient</th>
            <th>Category</th>
            <th>Doctor</th>
            <th>Date</th>
            <th>Payment</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filteredAppointments.length > 0 ? (
            filteredAppointments.map((a) => (
              <tr key={a.id}>
                <td>{a.appointmentNumber || "-"}</td>
                <td>{a.patientName || a.patientId || "-"}</td>
                <td>{a.service || "-"}</td>
                <td>{a.doctor || "-"}</td>
                <td>{a.date || "-"}</td>
                <td>{a.paymentStatus || "-"}</td>
                <td>{a.status || "-"}</td>
                <td>
                  <button
                    className="btnGhost table-btn"
                    type="button"
                    disabled={
                      !onCancel ||
                      cancellingId === a.id ||
                      a.status === "CANCELLED" ||
                      a.status === "COMPLETED"
                    }
                    onClick={() => onCancel?.(a.id)}
                  >
                    {a.status === "CANCELLED"
                      ? "Cancelled"
                      : cancellingId === a.id
                        ? "Cancelling..."
                        : "Cancel"}
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="8" className="no-results">
                No appointments found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
