/**
 * ============================================================
 * EMAIL SERVICE - PAYMENT NOTIFICATIONS
 * ============================================================
 * 
 * Sends payment notifications:
 * - Payment confirmation
 * - Refund confirmation  
 * - Admin alerts (fraud, manual review)
 * - Token expiry warnings
 */

const nodemailer = require('nodemailer');

// Email transport configuration
let transporter;

/**
 * Initialize email transport
 */
function initializeEmailTransport() {
  const emailConfig = {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for port 465, false for others
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  };

  transporter = nodemailer.createTransport(emailConfig);
  console.log('Email transport initialized');
}

/**
 * Send payment confirmation email
 * @param {Object} payment - Payment record
 * @param {String} patientEmail - Patient email address
 */
async function sendPaymentConfirmation(payment, patientEmail) {
  try {
    if (!transporter) {
      initializeEmailTransport();
    }

    const amount = (payment.amount / 100).toFixed(2);
    const htmlTemplate = `
      <h2>Payment Confirmation</h2>
      <p>Your payment has been processed successfully.</p>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Invoice Reference:</strong> ${payment.invoiceRef}</p>
        <p><strong>Amount:</strong> ${payment.currency} ${amount}</p>
        <p><strong>Status:</strong> ${payment.status.toUpperCase()}</p>
        <p><strong>Payment Method:</strong> ${payment.cardBrand} ****${payment.cardLast4}</p>
        <p><strong>Transaction ID:</strong> ${payment.cybersourceTransactionId}</p>
        <p><strong>Date:</strong> ${new Date(payment.capturedAt).toLocaleString()}</p>
      </div>
      
      <p>Thank you for your payment. If you have any questions, please contact our support team.</p>
    `;

    const mailOptions = {
      from: process.env.SMTP_FROM_EMAIL || 'noreply@hospital.local',
      to: patientEmail,
      subject: `Payment Confirmation - Invoice ${payment.invoiceRef}`,
      html: htmlTemplate
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`Payment confirmation sent to ${patientEmail}`, result.messageId);
    return result;

  } catch (error) {
    console.error('Failed to send payment confirmation email:', error.message);
    throw error;
  }
}

/**
 * Send refund confirmation email
 * @param {Object} payment - Payment record
 * @param {Number} refundAmount - Refund amount in cents
 * @param {String} patientEmail - Patient email
 * @param {String} reason - Refund reason
 */
async function sendRefundConfirmation(payment, refundAmount, patientEmail, reason = '') {
  try {
    if (!transporter) {
      initializeEmailTransport();
    }

    const amount = (refundAmount / 100).toFixed(2);
    const originalAmount = (payment.amount / 100).toFixed(2);
    const isFullRefund = refundAmount === payment.amount;

    const htmlTemplate = `
      <h2>Refund Confirmation</h2>
      <p>${isFullRefund ? 'Your full refund has been processed.' : 'A partial refund has been processed.'}</p>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Invoice Reference:</strong> ${payment.invoiceRef}</p>
        <p><strong>Original Amount:</strong> ${payment.currency} ${originalAmount}</p>
        <p><strong>Refund Amount:</strong> ${payment.currency} ${amount}</p>
        ${!isFullRefund ? `<p><strong>Remaining Balance:</strong> ${payment.currency} ${((payment.amount - refundAmount) / 100).toFixed(2)}</p>` : ''}
        <p><strong>Original Payment Method:</strong> ${payment.cardBrand} ****${payment.cardLast4}</p>
        <p><strong>Refund Reason:</strong> ${reason || 'Not specified'}</p>
        <p><strong>Date Requested:</strong> ${new Date().toLocaleString()}</p>
      </div>
      
      <p>The refund will appear in your account within 3-5 business days. If you have any questions, please contact our support team.</p>
    `;

    const mailOptions = {
      from: process.env.SMTP_FROM_EMAIL || 'noreply@hospital.local',
      to: patientEmail,
      subject: `Refund Confirmation - Invoice ${payment.invoiceRef}`,
      html: htmlTemplate
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`Refund confirmation sent to ${patientEmail}`, result.messageId);
    return result;

  } catch (error) {
    console.error('Failed to send refund confirmation email:', error.message);
    throw error;
  }
}

/**
 * Send admin alert for high-risk payment
 * @param {Object} payment - Payment record
 * @param {Object} notification - Webhook notification data
 */
async function sendAdminAlert(payment, notification) {
  try {
    if (!transporter) {
      initializeEmailTransport();
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@hospital.local';
    const amount = (payment.amount / 100).toFixed(2);

    const htmlTemplate = `
      <h2 style="color: #d32f2f;">High-Risk Payment Alert</h2>
      <p style="color: red;"><strong>Action Required</strong></p>
      
      <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
        <p><strong>Invoice Reference:</strong> ${payment.invoiceRef}</p>
        <p><strong>Amount:</strong> ${payment.currency} ${amount}</p>
        <p><strong>Risk Score:</strong> ${notification.riskScore || 'N/A'}/100</p>
        <p><strong>Decision:</strong> ${notification.decision}</p>
        <p><strong>Status:</strong> REQUIRES MANUAL REVIEW</p>
      </div>
      
      <h3>Risk Indicators:</h3>
      <ul>
        <li><strong>AVS Result:</strong> ${notification.avsResult || 'Not available'}</li>
        <li><strong>CVN Result:</strong> ${notification.cvnResult || 'Not available'}</li>
        <li><strong>3D Secure:</strong> ${notification.threeDSecure || 'Not authenticated'}</li>
        <li><strong>Payment Method:</strong> ${payment.cardBrand} ****${payment.cardLast4}</li>
      </ul>
      
      <h3>Required Action:</h3>
      <p>Please review this payment in the admin dashboard and take appropriate action (approve or decline).</p>
      
      <p style="color: #666; font-size: 12px; margin-top: 30px;">
        This is an automated alert. Transaction ID: ${payment.cybersourceTransactionId}
      </p>
    `;

    const mailOptions = {
      from: process.env.SMTP_FROM_EMAIL || 'noreply@hospital.local',
      to: adminEmail,
      subject: `[ALERT] High-Risk Payment Requires Review - ${payment.invoiceRef}`,
      html: htmlTemplate,
      priority: 'high'
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`Admin alert sent to ${adminEmail}`, result.messageId);
    return result;

  } catch (error) {
    console.error('Failed to send admin alert email:', error.message);
    throw error;
  }
}

/**
 * Send token expiry warning
 * @param {Object} token - PaymentToken record
 * @param {String} patientEmail - Patient email
 */
async function sendTokenExpiryWarning(token, patientEmail) {
  try {
    if (!transporter) {
      initializeEmailTransport();
    }

    const expiryDate = new Date(token.expiresAt).toLocaleDateString();

    const htmlTemplate = `
      <h2>Payment Method Expiry Notice</h2>
      <p>One of your saved payment methods will expire soon.</p>
      
      <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Card:</strong> ${token.cardBrand} ****${token.cardLast4}</p>
        <p><strong>Expiry Date:</strong> ${expiryDate}</p>
        <p><strong>Nickname:</strong> ${token.nickname || 'No nickname'}</p>
      </div>
      
      <p>Please update your payment method to ensure uninterrupted service. You can update or add a new payment method in your account settings.</p>
    `;

    const mailOptions = {
      from: process.env.SMTP_FROM_EMAIL || 'noreply@hospital.local',
      to: patientEmail,
      subject: `Payment Method Expiry Notice - ${token.cardBrand}`,
      html: htmlTemplate
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`Token expiry warning sent to ${patientEmail}`, result.messageId);
    return result;

  } catch (error) {
    console.error('Failed to send token expiry warning email:', error.message);
    throw error;
  }
}

/**
 * Send payment failure notification
 * @param {String} invoiceRef - Invoice reference
 * @param {String} patientEmail - Patient email
 * @param {String} reason - Failure reason
 */
async function sendPaymentFailure(invoiceRef, patientEmail, reason = '') {
  try {
    if (!transporter) {
      initializeEmailTransport();
    }

    const htmlTemplate = `
      <h2>Payment Processing Failed</h2>
      <p>We were unable to process your payment. Please review the details below and try again.</p>
      
      <div style="background: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Invoice Reference:</strong> ${invoiceRef}</p>
        <p><strong>Failure Reason:</strong> ${reason || 'Payment was declined by the payment processor'}</p>
        <p><strong>Retry Required:</strong> Yes</p>
      </div>
      
      <p>Please try again with a different payment method or contact our support team if the problem persists.</p>
    `;

    const mailOptions = {
      from: process.env.SMTP_FROM_EMAIL || 'noreply@hospital.local',
      to: patientEmail,
      subject: `Payment Failed - ${invoiceRef}`,
      html: htmlTemplate
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`Payment failure notification sent to ${patientEmail}`, result.messageId);
    return result;

  } catch (error) {
    console.error('Failed to send payment failure email:', error.message);
    throw error;
  }
}

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  initializeEmailTransport,
  sendPaymentConfirmation,
  sendRefundConfirmation,
  sendAdminAlert,
  sendTokenExpiryWarning,
  sendPaymentFailure
};
