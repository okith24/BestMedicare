import React, { useEffect, useState, useMemo } from "react";
import "./ManageStaff.css";
import { FaPlus, FaTrash } from "react-icons/fa";
import { useAuth } from "./auth/AuthContext";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import NavBar from "./NavBar";

const ManageStaff = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /* 
     STATE
   */
  const [staffList, setStaffList] = useState([]);
  const [doctorList, setDoctorList] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [flashMessage, setFlashMessage] = useState("");
  const [createdPayload, setCreatedPayload] = useState({ staff: null, doctor: null });

  const upsertById = (list, item) => {
    if (!item?._id) return list;
    const idx = list.findIndex((x) => String(x._id) === String(item._id));
    if (idx === -1) return [item, ...list];
    const next = [...list];
    next[idx] = { ...next[idx], ...item };
    return next;
  };

  const buildDoctorIdFromStaff = (staffDoc) => {
    const rawId = String(staffDoc?._id || "").slice(-6).toUpperCase();
    return `DOC-${rawId || "000000"}`;
  };
  const normalizeName = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/\b(dr|mr|mrs|ms)\.?\s+/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  const findStaffIdForDoctor = (doctor, staffListRef) => {
    const staffDocs = (staffListRef || []).filter((s) => s.role === "doctor");
    const doctorKey = String(doctor?.doctorId || "").toUpperCase();
    if (doctorKey) {
      const byKey = staffDocs.find((s) => buildDoctorIdFromStaff(s) === doctorKey);
      if (byKey?._id) return byKey._id;
    }
    const docName = normalizeName(doctor?.name);
    if (docName) {
      const exact = staffDocs.find((s) => normalizeName(s.name) === docName);
      if (exact?._id) return exact._id;
      const loose = staffDocs.find((s) => {
        const staffName = normalizeName(s.name);
        return staffName && (staffName.includes(docName) || docName.includes(staffName));
      });
      if (loose?._id) return loose._id;
    }
    return null;
  };

  useEffect(() => {
    const msg = String(location.state?.flash || "").trim();
    const createdStaff = location.state?.createdStaff || null;
    const createdDoctor = location.state?.createdDoctor || null;
    if (!msg) return;
    setFlashMessage(msg);
    setCreatedPayload({ staff: createdStaff, doctor: createdDoctor });
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  /* 
     FETCH DATA
 */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const staff = await apiFetch("/api/admin/staff");
        const doctors = await apiFetch("/api/admin/doctors");

        setStaffList((prev) => {
          let next = staff || prev || [];
          if (createdPayload.staff?._id) {
            next = upsertById(next, createdPayload.staff);
          }
          return next;
        });
        setDoctorList((prev) => {
          let next = doctors || prev || [];
          if (createdPayload.doctor?._id) {
            next = upsertById(next, createdPayload.doctor);
          }
          return next;
        });
      } catch (error) {
        console.error(error);
        alert("Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [createdPayload]);

  /* 
     COMBINE STAFF + DOCTORS
  */
  const combinedList = useMemo(() => {
    const getStaffDoctorId = (staff) =>
      `DOC-${String(staff?._id || "").slice(-6).toUpperCase()}`;

    const staffOnly = staffList
      .filter((item) => item.role !== "doctor")
      .map((item) => ({ ...item, source: "staff" }));

    const formattedDoctors = doctorList.map((doc) => {
      const staffId = doc.staffId || findStaffIdForDoctor(doc, staffList) || null;
      return {
        ...doc,
        role: "doctor",
        isActive: typeof doc.isActive === "boolean" ? doc.isActive : true,
        createdAt: doc.createdAt || new Date(),
        staffId,
        source: "doctor"
      };
    });

    const doctorIdSet = new Set(
      formattedDoctors.map((d) => String(d.doctorId || "").toUpperCase())
    );

    const fallbackStaffDoctors = staffList
      .filter((item) => item.role === "doctor")
      .filter((item) => !doctorIdSet.has(getStaffDoctorId(item)))
      .map((item) => ({
        ...item,
        role: "doctor",
        source: "staff"
      }));

    const merged = [...staffOnly, ...formattedDoctors, ...fallbackStaffDoctors];

    return merged.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      if (tb !== ta) return tb - ta;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [staffList, doctorList]);

  /* ===============================
     FILTERING
  =============================== */
  const filteredList = useMemo(() => {
    return combinedList.filter((item) => {
      const searchValue = search.toLowerCase();

      const matchesSearch =
        (item.name && item.name.toLowerCase().includes(searchValue)) ||
        (item.email && item.email.toLowerCase().includes(searchValue));

      const matchesRole =
        !roleFilter || item.role === roleFilter;

      const matchesStatus =
        !statusFilter ||
        String(item.isActive) === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [combinedList, search, roleFilter, statusFilter]);

  /* 
     AUTH CHECK
  */
  if (!user) return <Navigate to="/signin" replace />;
  if (user.role !== "superadmin") return <Navigate to="/" replace />;

  /* 
     DELETE FUNCTION
*/
  const deleteItem = async (item) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;

    try {
      if (item.source === "doctor") {
        await apiFetch(`/api/admin/doctors/${item._id}`, {
          method: "DELETE"
        });

        setDoctorList((prev) =>
          prev.filter((d) => d._id !== item._id)
        );
      } else {
        await apiFetch(`/api/admin/staff/${item._id}`, {
          method: "DELETE"
        });

        setStaffList((prev) =>
          prev.filter((s) => s._id !== item._id)
        );
      }
    } catch (error) {
      console.error(error);
      alert("Delete failed");
    }
  };

  const toggleStatus = async (item) => {
    let staffId = null;
    let doctorId = String(item?.doctorId || "").toUpperCase();
    const normalizeName = (value) =>
      String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

    if (item.source === "staff") {
      staffId = item._id;
      if (item.role === "doctor" && !doctorId) {
        doctorId = buildDoctorIdFromStaff(item);
      }
    } else if (item.source === "doctor") {
      staffId = item.staffId || findStaffIdForDoctor(item, staffList) || null;
    }

    const applyStatus = (nextActive) => {
      if (staffId) {
        setStaffList((prev) =>
          prev.map((s) => (String(s._id) === String(staffId) ? { ...s, isActive: nextActive } : s))
        );
      }
      setDoctorList((prev) =>
        prev.map((d) => {
          const matchesDoctorId =
            doctorId && String(d.doctorId || "").toUpperCase() === doctorId;
          const matchesRowId = String(d._id) === String(item._id);
          const matchesName = normalizeName(d.name) === normalizeName(item.name);
          if (matchesDoctorId || matchesRowId || matchesName) {
            return { ...d, isActive: nextActive };
          }
          return d;
        })
      );
    };

    const resolveStaffIdFromServer = async () => {
      try {
        const staff = await apiFetch("/api/admin/staff");
        const staffDocs = (staff || []).filter((s) => s.role === "doctor");
        const doctorKey = String(doctorId || "").toUpperCase();
        if (doctorKey) {
          const byKey = staffDocs.find((s) => buildDoctorIdFromStaff(s) === doctorKey);
          if (byKey?._id) return byKey._id;
        }
        const docName = normalizeName(item?.name);
        const exact = staffDocs.find((s) => normalizeName(s.name) === docName);
        if (exact?._id) return exact._id;
        const loose = staffDocs.find((s) => {
          const staffName = normalizeName(s.name);
          return staffName && (staffName.includes(docName) || docName.includes(staffName));
        });
        return loose?._id || null;
      } catch (error) {
        console.error(error);
        return null;
      }
    };

    if (!staffId) {
      staffId = await resolveStaffIdFromServer();
    }

    if (staffId) {
      try {
        const result = await apiFetch(`/api/admin/staff/${staffId}/status`, {
          method: "PATCH"
        });
        const nextActive = typeof result?.isActive === "boolean" ? result.isActive : !item.isActive;
        applyStatus(nextActive);
        return;
      } catch (error) {
        console.error(error);
      }
    }

    const doctorKey = doctorId || item._id;
    if (doctorKey) {
      try {
        const result = await apiFetch(`/api/admin/doctors/${doctorKey}/status`, {
          method: "PATCH"
        });
        const nextActive = typeof result?.isActive === "boolean" ? result.isActive : !item.isActive;
        applyStatus(nextActive);
        return;
      } catch (error) {
        console.error(error);
        alert(error?.message || "Failed to update status");
        return;
      }
    }

    alert("Unable to update status for this user. Missing staff mapping.");
  };

  /* 
     UI
  */
  return (
    <>
      <NavBar />
      <div className="manage-container">

      {/* Top Bar */}
      <div className="top-navbar">
        <div className="nav-left">Manage Staff & Doctors</div>
      </div>

      {/* Header */}
      <div className="page-header">
        <h1>Hospital Personnel</h1>
        <p>Manage doctors, nurses, and staff accounts.</p>
        {flashMessage ? <p>{flashMessage}</p> : null}
      </div>

      {/* Filters */}
      <div className="filter-section">
        <input
          type="text"
          placeholder="Search by name or email..."
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="filter-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All Roles</option>
          <option value="doctor">Doctor</option>
          <option value="staff">Staff</option>
          <option value="nurse">Nurse</option>
        </select>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>

        <button
          className="add-button"
          onClick={() => navigate("/superadmin/add-staff")}
        >
          <FaPlus /> Add Staff
        </button>
      </div>

      {/* Table */}
      <div className="table-card">
        <table className="staff-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="no-data">
                  Loading...
                </td>
              </tr>
            ) : filteredList.length === 0 ? (
              <tr>
                <td colSpan="5" className="no-data">
                  No matching records
                </td>
              </tr>
            ) : (
              filteredList.map((item) => (
                <tr key={item._id}>
                  <td>{item.name}</td>
                  <td>{item.role}</td>

                  <td>
                    <button
                      type="button"
                      className={
                        item.isActive
                          ? "status-button status-active"
                          : "status-button status-inactive"
                      }
                      onClick={() => toggleStatus(item)}
                    >
                      {item.isActive ? "Active" : "Deactive"}
                    </button>
                  </td>

                  <td>
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleDateString()
                      : "-"}
                  </td>

                  <td>
                    <FaTrash
                      style={{ cursor: "pointer", color: "red" }}
                      onClick={() => deleteItem(item)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      </div>
    </>
  );
};

export default ManageStaff;
