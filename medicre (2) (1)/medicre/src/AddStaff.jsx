import React, { useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import "./AddStaff.css";

const AddStaff = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    department: "",
    role: "",
    password: "",
    gender: "",
    isActive: ""
  });
  const [phoneError, setPhoneError] = useState("");

  const [loading, setLoading] = useState(false);

  /* AUTH PROTECTION */
  if (!user) return <Navigate to="/signin" replace />;
  if (user.role !== "superadmin") return <Navigate to="/" replace />;

  /* HANDLE INPUT */
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "phone") {
      const digitsOnly = value.replace(/\D/g, "").slice(0, 10);
      if (digitsOnly.length > 0 && digitsOnly.length < 10) {
        setPhoneError("Phone number must contain 10 numbers.");
      } else {
        setPhoneError("");
      }
      setForm((prev) => ({
        ...prev,
        phone: digitsOnly
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: name === "email" ? value.toLowerCase() : value
    }));
  };

  /* SUBMIT FORM */
  const handleSubmit = async () => {
    if (loading) return;

    if (
      !form.name ||
      !form.email ||
      !form.password ||
      !form.role ||
      !form.department
    ) {
      alert("Please complete all required fields.");
      return;
    }
    if (!form.email.includes("@")) {
      alert("Please enter a valid email address.");
      return;
    }
    if (form.phone && form.phone.length !== 10) {
      setPhoneError("Phone number must contain 10 numbers.");
      return;
    }

    try {
      setLoading(true);

      const result = await apiFetch("/api/admin/staff", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          isActive: String(form.isActive) === "true"
        })
      });

      let flashMessage = result?.message || "Staff member created successfully!";
      if (form.role === "doctor" && !result?.message) {
        flashMessage = result?.doctorSynced
          ? "Doctor added and synced to doctors collection."
          : "Doctor account created, but doctor collection sync did not confirm.";
      }

      setForm({
        name: "",
        email: "",
        phone: "",
        department: "",
        role: "",
        password: "",
        gender: "",
        isActive: ""
      });

      navigate("/superadmin/managestaff", {
        state: {
          flash: flashMessage,
          createdStaff: result?.staff || null,
          createdDoctor: result?.doctor || null
        }
      });

    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to create staff");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="addstaff-container">
      <div className="addstaff-card">

        <h1>Add New Staff Member</h1>
        <p>Create a new account for hospital personnel.</p>

        <div className="form-grid">

          <input
            name="name"
            placeholder="Full Name"
            value={form.name}
            onChange={handleChange}
          />

          <input
            name="email"
            type="email"
            placeholder="Email Address"
            value={form.email}
            onChange={handleChange}
          />

          <div className="form-field">
            <input
              name="phone"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              placeholder="Phone Number"
              value={form.phone}
              onChange={handleChange}
            />
            {phoneError ? (
              <div className="addstaff-error">{phoneError}</div>
            ) : null}
          </div>

          {/* DEPARTMENT */}
          <select
            name="department"
            value={form.department}
            onChange={handleChange}
          >
            <option value="">Select Department</option>
            <option value="aesthetic">Aesthetic</option>
            <option value="psychiatric">Psychiatric</option>
            <option value="physiotherapy">Physiotherapy</option>
            <option value="counselling">Counselling</option>
          </select>

          {/* ROLE */}
          <select
            name="role"
            value={form.role}
            onChange={handleChange}
          >
            <option value="">Select Role</option>
            <option value="doctor">Doctor</option>
            <option value="nurse">Nurse</option>
            <option value="staff">Staff</option>
          </select>

          <input
            name="password"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
          />

          {/* GENDER */}
          <select
            name="gender"
            value={form.gender}
            onChange={handleChange}
          >
            <option value="">Select Gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>

          {/* STATUS */}
          <select
            name="isActive"
            value={form.isActive}
            onChange={handleChange}
          >
            <option value="">Select Status</option>
            <option value="true">Active</option>
            <option value="false">Deactive</option>
          </select>

        </div>

        <div className="form-actions">

          <button
            className="cancel-btn"
            onClick={() => navigate("/superadmin/managestaff")}
          >
            Cancel
          </button>

          <button
            className="save-btn"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save Staff Member"}
          </button>

        </div>

      </div>
    </div>
  );
};

export default AddStaff;
