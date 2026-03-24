import React, { useEffect, useMemo, useState } from "react";
import "./PatientDashboard.css";

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function getAppointments() {
  try {
    return JSON.parse(localStorage.getItem("bmn_appointments") || "[]");
  } catch {
    return [];
  }
}

export default function PatientDashboard() {
  const [name] = useState("Jonathan"); // you can connect auth later
  const [list, setList] = useState(() => getAppointments());

  useEffect(() => {
    const refresh = () => setList(getAppointments());
    window.addEventListener("bmn_appointments_updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("bmn_appointments_updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const ongoing = useMemo(() => list.slice(0, 2), [list]); // left cards
  const history = useMemo(() => list.slice(0, 6), [list]); // table

  const points = useMemo(() => {
    // demo: paid gives points
    const paidCount = list.filter((x) => x.paymentStatus === "PAID").length;
    return 1000 + paidCount * 125;
  }, [list]);

  return (
    <div className="pdPage">
      <div className="pdShell">
        <div className="pdTop">
          <div>
            <div className="pdHello">Welcome, <span>{name}</span></div>
            <div className="pdSub">Everything is ready for your wellness journey.</div>
          </div>

          <div className="pdPoints glass">
            <div className="pdPtsLabel">LOYALTY STATUS</div>
            <div className="pdPtsRow">
              <div className="pdPtsNum">{points.toLocaleString()}</div>
              <div className="pdPtsTxt">POINTS</div>
            </div>
          </div>
        </div>

        <div className="pdGrid">
          {/* LEFT: My Appointments */}
          <div className="pdPanel glass">
            <div className="pdPanelHead">
              <div className="pdPanelTitle">My Appointments</div>
              <button className="pdLinkBtn" type="button">View History</button>
            </div>

            <div className="pdCards">
              {ongoing.length === 0 ? (
                <div className="pdEmpty">No bookings yet. Go to E-channelling and book an appointment 💙</div>
              ) : (
                ongoing.map((a) => (
                  <div key={a.id} className="pdCard">
                    <div className="pdAvatar">{(a.doctor || "D").slice(3, 4) || "D"}</div>

                    <div className="pdCardMain">
                      <div className="pdDoc">{a.doctor}</div>
                      <div className="pdRow">
                        <div className="pdMeta">
                          <div className="pdMetaLabel">DATE</div>
                          <div className="pdMetaVal">{formatDate(a.date)}</div>
                        </div>
                        <div className="pdMeta">
                          <div className="pdMetaLabel">TIME SLOT</div>
                          <div className="pdMetaVal">{formatTime(a.time)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="pdRight">
                      <div className="pdPayLabel">PAYMENT</div>
                      <div className={a.paymentStatus === "PAID" ? "pdPill paid" : "pdPill pending"}>
                        {a.paymentStatus === "PAID" ? "PAID" : "PENDING"}
                      </div>
                      <div className="pdMini">
                        {a.paymentMethod === "card" ? "Card" : "Cash"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT: Payment & Invoice History */}
          <div className="pdPanel glass">
            <div className="pdPanelHead">
              <div className="pdPanelTitle">Payment & Invoice History</div>
              <div className="pdIconBtn" title="Calendar">📅</div>
            </div>

            <div className="pdTable">
              <div className="pdTr head">
                <div>DATE</div>
                <div>SERVICE CATEGORY</div>
                <div>DOCTOR</div>
                <div>AMOUNT</div>
                <div>INVOICE</div>
              </div>

              {history.length === 0 ? (
                <div className="pdEmptyTbl">No payments yet.</div>
              ) : (
                history.map((a) => (
                  <div className="pdTr" key={a.id}>
                    <div className="pdTd">{formatDate(a.date)}</div>
                    <div className="pdTd">
                      <span className="pdTag">{a.service}</span>
                    </div>
                    <div className="pdTd">{a.doctor}</div>
                    <div className="pdTd">
                      <b>Rs. {Number(a.amount || 0).toLocaleString()}</b>
                      <div className={a.paymentStatus === "PAID" ? "pdSmall paid" : "pdSmall pending"}>
                        {a.paymentStatus}
                      </div>
                    </div>
                    <div className="pdTd">
                      <button
                        className="pdDl"
                        type="button"
                        onClick={() => alert(`Demo: invoice for ${a.ref}\n(Connect PDF later)`) }
                        title="Download invoice"
                      >
                        ⬇️
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div className="pdAll">VIEW ALL TRANSACTIONS</div>
            </div>
          </div>
        </div>

        {/* Bottom assistant */}
        <div className="pdBottom glass">
          <div className="pdBotLeft">
            <div className="pdBotTitle">MedicAI Assistant</div>
            <div className="pdOnline">● ALWAYS ONLINE</div>
            <div className="pdBotText">
              Instant healthcare powered by AI. Check your invoice details, explore services, or get reminders instantly.
            </div>
            <div className="pdBotMiniBtns">
              <button className="pdMiniBtn" type="button">Download last invoice</button>
              <button className="pdMiniBtn" type="button">Service pricing list</button>
            </div>
          </div>

          <div className="pdChat">
            <div className="pdChatMsg user">
              Can you help me find my last invoice for the Aesthetic session?
            </div>
            <div className="pdChatMsg bot">
              Of course! Your last Aesthetic invoice is available in the Payment History section.
              Want me to highlight it or send it to your email?
            </div>

            <div className="pdChatBar">
              <input className="pdChatInput" placeholder="Ask AI about invoices, services, or appointments..." />
              <button className="pdSend" type="button">➤</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
