import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./api.js";
import "./Invoice.css";

const initialItems = [
  { id: "1", description: "Medicare Facility Charges", notes: "Room, nursing, and hospital infrastructure", amount: "0.00" },
  { id: "2", description: "Doctor Consultation Fee", notes: "Consultation and review", amount: "0.00" },
  { id: "3", description: "Surgical Procedure", notes: "Procedure and theater charges", amount: "0.00" },
  { id: "4", description: "Prescription Medication", notes: "Medicine and consumables", amount: "0.00" },
];

function parseAmount(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function formatLkr(value) {
  return `LKR ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function makeReference() {
  const ts = Date.now().toString().slice(-7);
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `REF-${ts}-${rand}`;
}

export default function Invoice() {
  const MAX_PRINT_ROWS = 8;
  const MIN_PRINT_ROWS = 6;
  const navigate = useNavigate();
  const [patientName, setPatientName] = useState("");
  const [patientId, setPatientId] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [referenceNumber, setReferenceNumber] = useState(makeReference());
  const [appointmentNumber, setAppointmentNumber] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [serviceDate, setServiceDate] = useState(todayIso());
  const [issueDate, setIssueDate] = useState(todayIso());
  const [items, setItems] = useState(initialItems);
  const [status, setStatus] = useState("Draft");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [saveState, setSaveState] = useState("Ready");
  const [lookupState, setLookupState] = useState("");
  const [loyalty, setLoyalty] = useState({ visitsCount: 0, starPoints: 0 });
  const [loyaltyDiscountPercent, setLoyaltyDiscountPercent] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + parseAmount(item.amount), 0),
    [items]
  );
  const discountPercent = loyaltyDiscountPercent;
  const discountAmount = useMemo(
    () => Number(((subtotal * discountPercent) / 100).toFixed(2)),
    [subtotal, discountPercent]
  );
  const total = useMemo(
    () => Number((subtotal - discountAmount).toFixed(2)),
    [subtotal, discountAmount]
  );
  const printableItems = useMemo(
    () => items.filter((item) => item.description.trim() || item.notes.trim() || parseAmount(item.amount) > 0),
    [items]
  );
  const fullPrintItems = printableItems.length ? printableItems : items;
  const visiblePrintItems = useMemo(
    () => fullPrintItems.slice(0, MAX_PRINT_ROWS),
    [fullPrintItems]
  );
  const hiddenPrintItemsCount = Math.max(0, fullPrintItems.length - visiblePrintItems.length);
  const fillerPrintRows = Math.max(
    0,
    MIN_PRINT_ROWS - visiblePrintItems.length - (hiddenPrintItemsCount > 0 ? 1 : 0)
  );

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const name = patientName.trim();
      const email = patientEmail.trim().toLowerCase();
      const safePatientId = patientId.trim().toUpperCase();
      if (!safePatientId && !email && name.length < 2) {
        setLookupState("");
        setAppointmentNumber("");
        setAppointmentId("");
        setLoyalty({ visitsCount: 0, starPoints: 0 });
        setLoyaltyDiscountPercent(0);
        return;
      }

      try {
        setLookupState("Searching appointments...");
        let lookupQuery = `name=${encodeURIComponent(name)}`;
        if (safePatientId) {
          lookupQuery = `patientId=${encodeURIComponent(safePatientId)}`;
        } else if (email) {
          lookupQuery = `email=${encodeURIComponent(email)}`;
        }
        const data = await apiFetch(`/api/bill-payment/lookup/patient?${lookupQuery}`);
        if (cancelled) return;
        if (data?.found) {
          setAppointmentNumber(data.appointmentNumber || "");
          setAppointmentId(data.appointmentId || "");
          if (!patientName.trim() && data.patientName) {
            setPatientName(data.patientName);
          }
          if (data.patientId) {
            setPatientId(data.patientId);
          }
          if (!patientEmail.trim() && data.patientEmail) {
            setPatientEmail(data.patientEmail);
          }
          setLoyalty(data.loyalty || { visitsCount: 0, starPoints: 0 });
          setLoyaltyDiscountPercent(Number(data?.discountPercent || 0));
          setLookupState("Patient matched with latest appointment.");
        } else {
          setAppointmentNumber("");
          setAppointmentId("");
          setLoyalty({ visitsCount: 0, starPoints: 0 });
          setLoyaltyDiscountPercent(0);
          setLookupState("No appointment found for this patient name.");
        }
      } catch (error) {
        if (!cancelled) {
          setLookupState(`Lookup failed: ${error.message}`);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientName, patientId, patientEmail]);

  const updateItem = (id, key, value) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [key]: value } : item))
    );
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        description: "Other",
        notes: "",
        amount: "0.00",
      },
    ]);
  };

  const saveDraft = async () => {
    try {
      setSaveState("Saving draft...");
      const payload = {
        patientName,
        patientId,
        patientEmail,
        referenceNumber: referenceNumber.trim(),
        appointmentNumber,
        serviceDate,
        issueDate,
        status: "Draft",
        paymentMethod,
        paymentStatus: paymentMethod === "card" ? "PAID" : "PENDING",
        discountPercent,
        items: items.map((item) => ({
          description: item.description,
          notes: item.notes,
          amount: parseAmount(item.amount),
        })),
      };

      await apiFetch("/api/bill-payment/upsert", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setStatus("Draft");
      setSaveState(`Draft saved at ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      setSaveState(`Save failed: ${error.message}`);
    }
  };

  const finalizeInvoice = async () => {
    if (!patientName.trim()) {
      setSaveState("Patient name is required");
      return;
    }
    if (!referenceNumber.trim()) {
      setSaveState("Reference number is required");
      return;
    }

    try {
      setSubmitting(true);
      setSaveState("Submitting final bill...");
      const payload = {
        patientName,
        patientId,
        patientEmail,
        referenceNumber: referenceNumber.trim(),
        appointmentId,
        appointmentNumber,
        serviceDate,
        issueDate,
        paymentMethod,
        items: items.map((item) => ({
          description: item.description,
          notes: item.notes,
          amount: parseAmount(item.amount),
        })),
      };
      const saved = await apiFetch("/api/bill-payment/finalize", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setStatus(saved.status || "Finalized");
      if (saved?.loyaltySnapshot) {
        setLoyalty(saved.loyaltySnapshot);
      }
      if (typeof saved?.discountPercent === "number") {
        setLoyaltyDiscountPercent(saved.discountPercent);
      }
      setSaveState(`Final bill submitted at ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      setSaveState(`Submit failed: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page invPage">
      <div className="container invWrap">
        <section className="glass invTop invNoPrint">
          <div>
            <div className="invHospital">BEST Medicare Nawala</div>
            <div className="invSub">Healthcare Excellence - Medical & Research</div>
          </div>
          <div className="invTopRight">
            <div>122 Healthcare Dr, Nawala, LK</div>
            <div>+94 11 234 5678 | info@bestmed.lk</div>
            <div className="invBadge">Invoice Status: {status}</div>
            <div>{saveState}</div>
          </div>
        </section>

        <section className="glass invCard invNoPrint">
          <div className="invMetaGrid">
            <div className="invMetaBlock">
              <div className="invKicker">Patient Details</div>
              <label className="invLabel">Full Name</label>
              <input className="invInput" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
              <label className="invLabel">Patient ID</label>
              <input
                className="invInput"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value.toUpperCase())}
                placeholder="Ex: OKIH200474"
              />
              <label className="invLabel">Patient Email</label>
              <input className="invInput" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} placeholder="patient@email.com" />
              <div className="invLookup">{lookupState}</div>
            </div>

            <div className="invMetaBlock">
              <div className="invKicker">Identifiers</div>
              <label className="invLabel">Reference Number</label>
              <input className="invInput" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
              <label className="invLabel">Appointment Number</label>
              <input className="invInput" value={appointmentNumber} onChange={(e) => setAppointmentNumber(e.target.value)} />
              <label className="invLabel">Payment Method</label>
              <select
                className="invInput"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
              </select>
            </div>

            <div className="invMetaBlock">
              <div className="invKicker">Billing Info</div>
              <label className="invLabel">Date of Service</label>
              <input className="invInput" type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
              <label className="invLabel">Bill Issued On</label>
              <input className="invInput" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              <label className="invLabel">Payment Status</label>
              <input className="invInput" value="Auto set to PAID after final submit" readOnly />
              <div className="invLookup">
                Visits: {loyalty.visitsCount} | Star points: {loyalty.starPoints} | Discount: {discountPercent}%
              </div>
            </div>
          </div>

          <div className="invTable">
            <div className="invHead">
              <div>Description</div>
              <div>Amount (LKR)</div>
            </div>

            {items.map((item) => (
              <div className="invRow" key={item.id}>
                <div className="invDescCol">
                  <input
                    className="invInput"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, "description", e.target.value)}
                  />
                  <input
                    className="invInput invNote"
                    placeholder="Add category notes..."
                    value={item.notes}
                    onChange={(e) => updateItem(item.id, "notes", e.target.value)}
                  />
                </div>
                <div className="invAmtCol">
                  <div className="invCurrency">LKR</div>
                  <input
                    className="invInput invAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.amount}
                    onChange={(e) => updateItem(item.id, "amount", e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="invActions">
            <button className="btnGhost" type="button" onClick={addItem}>
              + Add Line Item
            </button>
            <div className="invTotals">
              <div>Subtotal: {formatLkr(subtotal)}</div>
              <div>Discount ({discountPercent}%): -{formatLkr(discountAmount)}</div>
              <div className="invTotalRow">
                <span>Total:</span>
                <strong className="invTotal">{formatLkr(total)}</strong>
              </div>
            </div>
          </div>

          <div className="invBottom">
            <div className="invTerms">
              Final bill stores to database and appears in patient dashboard as read-only invoice.
            </div>
            <div className="invButtons">
              <button className="btnGhost" type="button" onClick={saveDraft}>
                Save Draft
              </button>
              <button className="btnGhost" type="button" onClick={() => window.print()}>
                Print Statement
              </button>
              <button className="btnPrimary" type="button" onClick={finalizeInvoice} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Final Bill"}
              </button>
              <button className="btnPrimary" type="button" onClick={() => navigate("/staffdashboard")}>
                Back to Dashboard
              </button>
            </div>
          </div>
        </section>

        <section className="invPrintSheet">
          <div className="invPrintTopBar" />

          <header className="invPrintHeader">
            <div className="invPrintHeaderLeft">
              <div className="invPrintBrand">
                <img src="/images/logo.png" alt="Best Medicare logo" />
                <div>
                  <div className="invPrintHospital">BEST Medicare Nawala</div>
                  <div className="invPrintSub">Healthcare Excellence - Medical & Research</div>
                </div>
              </div>

              <div className="invPrintTitle">Invoice</div>
              <div className="invPrintRef">#{referenceNumber || "-"}</div>
            </div>

            <div className="invPrintMeta">
              <div className="invPrintMetaGroup">
                <strong>Billing To</strong>
                <div>{patientName || "-"}</div>
                <div>{patientEmail || "-"}</div>
                <div>Patient ID: {patientId || "-"}</div>
              </div>
              <div className="invPrintMetaGroup">
                <strong>Date</strong>
                <div>{formatDate(issueDate)}</div>
                <div>Service: {formatDate(serviceDate)}</div>
                <div>Appointment: {appointmentNumber || "-"}</div>
              </div>
            </div>
          </header>

          <div className="invPrintBody">
            <table className="invPrintTable invPrintTableSample">
              <thead>
                <tr>
                  <th>Item Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Price</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {visiblePrintItems.map((item, idx) => (
                  <tr key={item.id}>
                    <td>{item.description || item.notes || `Line Item ${idx + 1}`}</td>
                    <td className="num">1</td>
                    <td className="num">{parseAmount(item.amount).toFixed(2)}</td>
                    <td className="num">{parseAmount(item.amount).toFixed(2)}</td>
                  </tr>
                ))}
                {hiddenPrintItemsCount > 0 && (
                  <tr>
                    <td>{`${hiddenPrintItemsCount} additional item(s) summarized in total`}</td>
                    <td className="num">-</td>
                    <td className="num">-</td>
                    <td className="num">Included</td>
                  </tr>
                )}
                {Array.from({ length: fillerPrintRows }).map((_, idx) => (
                  <tr key={`filler-row-${idx}`} className="invPrintFillerRow">
                    <td>&nbsp;</td>
                    <td className="num">&nbsp;</td>
                    <td className="num">&nbsp;</td>
                    <td className="num">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <section className="invPrintBottomGrid">
              <div className="invPrintNote">
                <div className="invPrintNoteTitle">Note</div>
                <p>
                  Payment Method: {String(paymentMethod || "").toUpperCase()} | Status: {status}. 
                  Loyalty visits: {loyalty.visitsCount}, star points: {loyalty.starPoints}. 
                  Discount applied: {discountPercent}%.
                </p>
              </div>

              <div className="invPrintTotals">
                <div><span>Subtotal</span><strong>{formatLkr(subtotal)}</strong></div>
                <div><span>Discount ({discountPercent}%)</span><strong>-{formatLkr(discountAmount)}</strong></div>
                <div className="invPrintTotalLast"><span>TOTAL</span><strong>{formatLkr(total)}</strong></div>
              </div>
            </section>
          </div>

          <footer className="invPrintFooter">
            <div>BEST Medicare Nawala - 122 Healthcare Dr, Nawala, LK</div>
            <div>+94 11 234 5678 - info@bestmed.lk - Generated {new Date().toLocaleString()}</div>
          </footer>
        </section>
      </div>
    </div>
  );
}
