import React from "react";

const SECTIONS = [
  {
    title: "1. Account & Eligibility",
    items: [
      "You confirm that the Full Name, Email, National ID, Phone Number, and Gender provided are true, accurate, and belong to you (or a patient you are authorized to represent).",
      "Bookings made on behalf of another patient, including minors, must be made by a person authorized to do so, such as a parent or legal guardian.",
      "BESTmedicare Nawala reserves the right to suspend or terminate accounts created with false or misleading information.",
      "You are responsible for keeping your password confidential and for all activity that occurs under your account.",
    ],
  },
  {
    title: "2. Collection & Use of Information",
    items: [
      "We collect your name, email, NIC number, phone number, and gender for the purposes of patient identification, appointment booking, sending booking confirmations and reminders, and billing.",
      "Your NIC number is used solely to verify patient identity at the hospital and prevent duplicate or fraudulent bookings.",
      "Your details will be shared only with BESTmedicare Nawala staff and the consulting doctor relevant to your appointment.",
      "We do not sell or share your personal information with third parties for marketing purposes.",
      "Card payments are processed securely by our payment gateway provider; BESTmedicare Nawala does not store your card details.",
    ],
  },
  {
    title: "3. Appointments & Channeling",
    items: [
      "The appointment number and estimated time shown are approximate; actual consultation time may vary depending on the doctor's schedule.",
      "Doctors may cancel, delay, or reschedule sessions due to unavoidable circumstances. In such cases, you will be notified via SMS/email.",
      "The total fee displayed at checkout includes the doctor's fee, hospital fee, and a booking/service charge.",
      "Arriving after your appointment number has passed may result in being seen at the end of the session, at the doctor's discretion.",
    ],
  },
  {
    title: "4. Cancellations & Refunds",
    items: [
      "For all cancellations and refunds, please contact us directly via phone or email as displayed on our contact page.",
    ],
  },
  {
    title: "5. Communications",
    items: [
      "By creating an account, you agree to receive transactional messages (booking confirmations, reminders, cancellation notices) via SMS and email.",
      "Promotional messages will only be sent if you have separately opted in, and you may unsubscribe at any time.",
    ],
  },
  {
    title: "6. Acceptable Use",
    items: [
      "You agree not to make fraudulent, duplicate, or speculative bookings, or use the platform to harvest doctor or session information.",
      "Misuse of the platform may result in account termination without refund of service charges.",
    ],
  },
  {
    title: "7. Limitation of Liability",
    items: [
      "BESTmedicare Nawala's e-channeling platform facilitates appointment booking only; medical advice, diagnosis, and treatment are provided solely by the consulting doctor at the hospital.",
      "We are not liable for losses arising from incorrect contact details provided by you, missed notifications due to network issues, or events beyond our reasonable control.",
    ],
  },
];

export default function TermsModal({ onClose }) {
  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Terms & Conditions</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>

        <p style={styles.intro}>
          Please read these terms carefully before using the BESTmedicare Nawala e-channeling platform.
          By creating an account you agree to be bound by them.
        </p>

        <div style={styles.body}>
          {SECTIONS.map((section) => (
            <div key={section.title} style={styles.section}>
              <h3 style={styles.sectionTitle}>{section.title}</h3>
              <ul style={styles.list}>
                {section.items.map((item, i) => (
                  <li key={i} style={styles.listItem}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          <button style={styles.acceptBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(10,20,40,0.55)",
    backdropFilter: "blur(4px)",
    zIndex: 1000,
    display: "grid",
    placeItems: "center",
    padding: "16px",
  },
  modal: {
    background: "rgba(255,255,255,0.97)",
    borderRadius: "20px",
    width: "min(680px, 100%)",
    maxHeight: "82vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 24px 64px rgba(10,20,40,0.22)",
    border: "1px solid rgba(127,149,171,0.22)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px 16px",
    borderBottom: "1px solid rgba(127,149,171,0.18)",
  },
  title: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 950,
    color: "rgba(28,46,66,0.92)",
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: "18px",
    cursor: "pointer",
    color: "rgba(28,46,66,0.55)",
    lineHeight: 1,
    padding: "2px 6px",
    borderRadius: "6px",
  },
  intro: {
    margin: 0,
    padding: "14px 24px 10px",
    fontSize: "13px",
    color: "rgba(28,46,66,0.62)",
    lineHeight: 1.6,
  },
  body: {
    overflowY: "auto",
    padding: "4px 24px 16px",
    flex: 1,
  },
  section: {
    marginTop: "18px",
  },
  sectionTitle: {
    margin: "0 0 8px",
    fontSize: "14px",
    fontWeight: 900,
    color: "rgba(31,113,191,0.92)",
  },
  list: {
    margin: 0,
    paddingLeft: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  listItem: {
    fontSize: "13px",
    color: "rgba(28,46,66,0.80)",
    lineHeight: 1.6,
  },
  footer: {
    padding: "14px 24px",
    borderTop: "1px solid rgba(127,149,171,0.18)",
    display: "flex",
    justifyContent: "flex-end",
  },
  acceptBtn: {
    padding: "10px 28px",
    borderRadius: "12px",
    border: "none",
    background: "rgba(31,113,191,0.92)",
    color: "#fff",
    fontWeight: 900,
    fontSize: "14px",
    cursor: "pointer",
  },
};
