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
    const header = String(req.headers.authorization || '');

    if (!header.startsWith('Bearer ')) return next();

    const token = header.slice('Bearer '.length).trim();
    if (!token) return next();

    const tokenHash = hashToken(token);

    const session = await Session.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() }
    });

    if (!session) return next();

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

    req.authToken = token;
    req.authTokenHash = tokenHash;
    req.authSession = session;
    req.authUser = sanitizeUser(user);

    next();

  } catch (err) {
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
  if (!req.authUser) {
    return res.status(401).json({ message: 'Unauthorized. Please sign in.' });
  }
  next();
}

/*

PATIENT ONLY

*/
function requirePatient(req, res, next) {
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