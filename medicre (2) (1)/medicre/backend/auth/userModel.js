const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
      unique: true
    },

    nationalId: {
      type: String,
      trim: true,
      uppercase: true,
      default: ''
    },

    patientId: {
      type: String,
      trim: true,
      uppercase: true,
      default: ''
    },

    phone: {
      type: String,
      trim: true,
      default: ''
    },

    gender: {
      type: String,
      enum: ['male', 'female'],
      default: ''
    },

    //  UPDATED ROLE FIELD
    role: {
      type: String,
      enum: ['superadmin', 'staff', 'patient'], // added superadmin
      default: 'patient'
    },

    passwordHash: { type: String, required: true },
    passwordSalt: { type: String, required: true },

    lastLoginAt: { type: Date, default: null },
    loginCount: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },

    phoneVerifiedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

/* 
   Indexes
*/

// Unique nationalId only if not empty
UserSchema.index(
  { nationalId: 1 },
  {
    unique: true,
    partialFilterExpression: { nationalId: { $type: 'string', $ne: '' } }
  }
);

// Unique patientId only if not empty
UserSchema.index(
  { patientId: 1 },
  {
    unique: true,
    partialFilterExpression: { patientId: { $type: 'string', $ne: '' } }
  }
);

//  Ensure ONLY ONE superadmin can exist
UserSchema.index(
  { role: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'superadmin' }
  }
);

module.exports = mongoose.model('User', UserSchema);
