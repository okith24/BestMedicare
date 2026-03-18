const express = require("express");
const router = express.Router();

const StaffUser = require("../models/StaffUser");
const Doctor = require("../models/Doctor");

const { hashPassword, normalizeEmail } = require("../auth/security");
const { attachAuth, requireAdmin } = require("../auth/middleware");

/*
================================
ADMIN AUTH PROTECTION
================================
*/

router.use(attachAuth, requireAdmin);

/*
================================
HELPER FUNCTIONS
================================
*/

function buildDoctorIdFromStaff(staffDoc) {
  const rawId = String(staffDoc?._id || "").slice(-6).toUpperCase();
  return `DOC-${rawId || "000000"}`;
}

function buildConsultationFromDepartment(department) {
  const map = {
    aesthetic: "Dermatology / Aesthetic",
    psychiatric: "Psychiatry",
    physiotherapy: "Physiotherapy",
    counselling: "Counselling"
  };

  return map[String(department || "").toLowerCase()] || "General";
}

/*
================================
STAFF ROUTES
================================
*/

router.get("/staff", async (req, res) => {
  try {

    const staff = await StaffUser.find()
      .sort({ createdAt: -1 });

    return res.status(200).json(staff);

  } catch (err) {

    console.error(err);
    return res.status(500).json({
      message: "Failed to fetch staff"
    });

  }
});


router.post("/staff", async (req, res) => {

  try {

    const {
      name,
      email,
      phone,
      department,
      gender,
      role,
      password,
      isActive
    } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        message: "Name, email, role and password are required"
      });
    }

    const normalizedEmail = normalizeEmail(email);
    const resolvedUsername = normalizedEmail;

    const existingUser = await StaffUser.findOne({
      $or: [
        { email: normalizedEmail },
        { username: resolvedUsername }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Email already exists"
      });
    }

    const { salt, hash } = hashPassword(password);

    const newStaff = new StaffUser({
      name,
      email: normalizedEmail,
      username: resolvedUsername,
      phone,
      department,
      gender,
      role: role || "staff",
      passwordSalt: salt,
      passwordHash: hash,
      isActive: typeof isActive === "boolean" ? isActive : true
    });

    await newStaff.save();

    return res.status(201).json({
      message: "Staff created successfully",
      staff: newStaff
    });

  } catch (err) {

    console.error(err);
    return res.status(500).json({
      message: "Failed to create staff"
    });

  }

});


router.delete("/staff/:id", async (req, res) => {

  try {

    const id = req.params.id;

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({
        message: "Invalid staff ID"
      });
    }

    const staff = await StaffUser.findById(id);

    if (!staff) {
      return res.status(404).json({
        message: "Staff not found"
      });
    }

    if (staff.role === "doctor") {
      const doctorId = buildDoctorIdFromStaff(staff);
      await Doctor.deleteOne({ doctorId });
    }

    await staff.deleteOne();

    return res.status(200).json({
      message: "Staff deleted successfully"
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      message: "Failed to delete staff"
    });

  }

});


router.patch("/staff/:id/status", async (req, res) => {

  try {

    const staff = await StaffUser.findById(req.params.id);

    if (!staff) {
      return res.status(404).json({
        message: "Staff not found"
      });
    }

    staff.isActive = !staff.isActive;

    await staff.save();

    if (staff.role === "doctor") {
      const doctorId = buildDoctorIdFromStaff(staff);
      await Doctor.updateOne(
        { doctorId },
        { $set: { isActive: !!staff.isActive } }
      );
    }

    return res.status(200).json({
      message: "Status updated",
      isActive: staff.isActive
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      message: "Failed to update status"
    });

  }

});

/*
================================
DOCTOR ROUTES
================================
*/

router.get("/doctors", async (req, res) => {

  try {

    const doctors = await Doctor.find()
      .sort({ name: 1 });

    return res.status(200).json(doctors);

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      message: "Failed to fetch doctors"
    });

  }

});


router.post("/doctors", async (req, res) => {

  try {

    const {
      doctorId,
      name,
      consultation,
      consultationFee,
      availability
    } = req.body;

    if (!doctorId || !name) {
      return res.status(400).json({
        message: "Doctor ID and name are required"
      });
    }

    const existingDoctor = await Doctor.findOne({ doctorId });

    if (existingDoctor) {
      return res.status(400).json({
        message: "Doctor ID already exists"
      });
    }

    const newDoctor = new Doctor({
      doctorId,
      name,
      consultation,
      consultationFee,
      availability,
      isActive: true
    });

    await newDoctor.save();

    return res.status(201).json({
      message: "Doctor created successfully",
      doctor: newDoctor
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      message: "Failed to create doctor"
    });

  }

});


router.delete("/doctors/:id", async (req, res) => {

  try {

    const doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({
        message: "Doctor not found"
      });
    }

    await doctor.deleteOne();

    return res.status(200).json({
      message: "Doctor deleted successfully"
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      message: "Failed to delete doctor"
    });

  }

});

module.exports = router;
