// Mongoose model for billing invoices.

const mongoose = require('mongoose');

const InvoiceItemSchema = new mongoose.Schema(
  {
    description: { type: String, trim: true, default: 'Other' },
    notes: { type: String, trim: true, default: '' },
    amount: { type: Number, default: 0 }
  },
  { _id: false }
);

const InvoiceSchema = new mongoose.Schema(
  {
    patientName: { type: String, trim: true, default: '' },
    patientId: { type: String, trim: true, uppercase: true, default: '' },
    patientEmail: { type: String, trim: true, lowercase: true, default: '' },
    referenceNumber: { type: String, trim: true, required: true, unique: true },
    // Report generation links invoices back to appointments using these identifiers.
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    appointmentNumber: { type: String, trim: true, default: '' },
    serviceDate: { type: String, trim: true, default: '' },
    // Revenue stats filter by finalized invoices within the selected issue date range.
    issueDate: { type: String, trim: true, default: '' },
    status: { type: String, trim: true, default: 'Draft' },
    paymentStatus: { type: String, enum: ['PENDING', 'PAID'], default: 'PENDING' },
    // Payment distribution charts use this field.
    paymentMethod: { type: String, enum: ['cash', 'card'], default: 'cash' },
    subtotal: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    // Total is the value rolled up into revenue cards and summaries.
    total: { type: Number, default: 0 },
    loyaltySnapshot: {
      visitsCount: { type: Number, default: 0 },
      starPoints: { type: Number, default: 0 }
    },
    submittedAt: { type: Date, default: null },
    items: { type: [InvoiceItemSchema], default: [] }
  },
  { timestamps: true }
);

InvoiceSchema.index({ patientEmail: 1, createdAt: -1 });
InvoiceSchema.index({ patientId: 1, createdAt: -1 });
InvoiceSchema.index({ appointmentNumber: 1 });

module.exports = mongoose.model('Invoice', InvoiceSchema);

