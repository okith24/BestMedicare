// Authentication and role guard middleware.

const Session = require('./sessionModel');
const User = require('./userModel'); // Patients
const StaffUser = require('../models/StaffUser'); // Staff users
const Staff = require('../models/Staff'); // Legacy staff users
const { hashToken, sanitizeUser } = require('./security');

/*

ATTACH AUTH USER

*/
async function attachAuth(req, res, next) {
  try {
    // Read the Bearer token from the Authorization header if one was sent.
    const header = String(req.headers.authorization || '');

    if (!header.startsWith('Bearer ')) return next();

    const token = header.slice('Bearer '.length).trim();
    if (!token) return next();

    // Sessions store only the hashed token, so hash the incoming token before lookup.
    const tokenHash = hashToken(token);

    const session = await Session.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() }
    });

    if (!session) return next();

    // A valid session may belong to a patient, current staff user, or legacy staff user.
    let user = null;

    // Patient users
    user = await User.findById(session.userId);

    // Staff users
    if (!user) {
      user = await StaffUser.findById(session.userId);
    }

    // Legacy staff
    if (!user) {
      user = await Staff.findById(session.userId);
    }

    if (!user || !user.isActive) return next();

    // Store the resolved auth details on the request for later middleware/routes.
    req.authToken = token;
    req.authTokenHash = tokenHash;
    req.authSession = session;
    req.authUser = sanitizeUser(user);

    next();

  } catch (err) {
    // Unexpected DB/system errors during session lookup — log but don't silently
    // grant anonymous access. Clear auth and continue; requireAuth will reject if needed.
    console.error('attachAuth lookup error:', err?.message || err);
    req.authToken = null;
    req.authTokenHash = null;
    req.authSession = null;
    req.authUser = null;

    next();
  }
}

/*

AUTH REQUIRED

*/
function requireAuth(req, res, next) {
  // Block the request unless attachAuth already found a signed-in user.
  if (!req.authUser) {
    return res.status(401).json({ message: 'Unauthorized. Please sign in.' });
  }
  next();
}

/*

PATIENT ONLY

*/
function requirePatient(req, res, next) {
  // Only authenticated users with the patient role can pass this guard.
  if (!req.authUser) {
    return res.status(401).json({ message: 'Unauthorized. Please sign in.' });
  }

  if (req.authUser.role !== 'patient') {
    return res.status(403).json({ message: 'Patient access only' });
  }

  next();
}

/*

STAFF ONLY

*/
function requireStaff(req, res, next) {
  // Allow the staff-side working roles through this guard.
  if (!req.authUser) {
    return res.status(401).json({ message: 'Unauthorized. Please sign in.' });
  }

  if (!['staff', 'doctor', 'nurse'].includes(String(req.authUser.role || '').toLowerCase())) {
    return res.status(403).json({ message: 'Staff access only' });
  }

  next();
}

/*

ADMIN ONLY

*/
function requireAdmin(req, res, next) {
  // Allow only admin-level users for protected management routes.
  if (!req.authUser) {
    return res.status(401).json({ message: 'Unauthorized. Please sign in.' });
  }

  if (!['admin', 'superadmin'].includes(String(req.authUser.role || '').toLowerCase())) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  next();
}

/*

SUPER ADMIN ONLY

*/
function requireSuperAdmin(req, res, next) {
  // Restrict the route to the highest admin role only.
  if (!req.authUser) {
    return res.status(401).json({ message: 'Unauthorized. Please sign in.' });
  }

  if (String(req.authUser.role || '').toLowerCase() !== 'superadmin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }

  next();
}

/*

FLEXIBLE ROLE CHECK

*/
function requireRole(...roles) {
  // Build a reusable middleware that checks whether the user has one of the allowed roles.
  return (req, res, next) => {
    if (!req.authUser) {
      return res.status(401).json({ message: 'Unauthorized. Please sign in.' });
    }

    const role = String(req.authUser.role || '').toLowerCase();

    if (!roles.includes(role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    next();
  };
}

module.exports = {
  attachAuth,
  requireAuth,
  requirePatient,
  requireStaff,
  requireAdmin,
  requireSuperAdmin,
  requireRole
};
