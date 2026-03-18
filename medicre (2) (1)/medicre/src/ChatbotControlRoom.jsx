import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api.js";
import { useAuth } from "./auth/AuthContext.jsx";
import "./chatbot-control.css";

export default function ChatbotControlRoom() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [askError, setAskError] = useState("");
  const [asking, setAsking] = useState(false);
  const canViewLimitations = useMemo(
    () => Boolean(user && (user.role === "staff" || user.role === "superadmin")),
    [user]
  );
  const canEditLimitations = useMemo(
    () => Boolean(user && user.role === "superadmin"),
    [user]
  );

  const signedInAs = useMemo(() => {
    if (!user) return "";
    return user.email || user.name || "";
  }, [user]);

  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      if (!canViewLimitations) {
        if (mounted) {
          setLoadingSettings(false);
        }
        return;
      }
      try {
        const payload = await apiFetch("/api/chatbot/settings");
        if (mounted) {
          setSettings({
            factCheckerEnabled: Boolean(
              typeof payload.ragEnabled === "boolean"
                ? payload.ragEnabled
                : payload.factCheckerEnabled
            ),
            emergencyBrakeEnabled: Boolean(payload.emergencyBrakeEnabled),
            diagnosisGuardEnabled: Boolean(payload.diagnosisGuardEnabled),
          });
        }
      } catch (err) {
        if (mounted) setSettingsError(err.message || "Failed to load settings.");
      } finally {
        if (mounted) setLoadingSettings(false);
      }
    };
    loadSettings();
    return () => {
      mounted = false;
    };
  }, [canViewLimitations]);

  const updateSetting = (key) => {
    if (!canEditLimitations) return;
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const saveSettings = async () => {
    if (!canEditLimitations) return;
    if (!settings) return;
    setSaving(true);
    setSettingsError("");
    try {
      const payload = await apiFetch("/api/chatbot/settings", {
        method: "PUT",
        body: JSON.stringify({
          ragEnabled: settings.factCheckerEnabled,
          factCheckerEnabled: settings.factCheckerEnabled,
          emergencyBrakeEnabled: settings.emergencyBrakeEnabled,
          diagnosisGuardEnabled: settings.diagnosisGuardEnabled,
        }),
      });
      setSettings({
        factCheckerEnabled: Boolean(
          typeof payload.ragEnabled === "boolean"
            ? payload.ragEnabled
            : payload.factCheckerEnabled
        ),
        emergencyBrakeEnabled: Boolean(payload.emergencyBrakeEnabled),
        diagnosisGuardEnabled: Boolean(payload.diagnosisGuardEnabled),
      });
    } catch (err) {
      setSettingsError(err.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const sendQuestion = async () => {
    const trimmed = question.trim();
    if (!trimmed || asking) return;
    setAskError("");
    setAsking(true);
    setQuestion("");

    setMessages((prev) => [
      ...prev,
      { role: "user", text: trimmed, sources: [] },
    ]);

    try {
      const payload = await apiFetch("/api/chatbot/ask", {
        method: "POST",
        body: JSON.stringify({ question: trimmed }),
      });

      if (payload?.message && !payload?.answer) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: payload.message, sources: [] },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: payload?.answer || "No response available.",
            sources: payload?.sources || [],
          },
        ]);
      }
    } catch (err) {
      const msg = err?.message || "Unable to contact the chatbot.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: msg, sources: [] },
      ]);
      setAskError(msg);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="page chatbotControl">
      <div className="container chatbotControl__wrap">
        <section className="glass chatbotControl__hero">
          <div className="chatbotControl__title">Chatbot Control Room</div>
          <div className="chatbotControl__subtitle">
            Signed in as {signedInAs || "user"}
          </div>
        </section>

        <div className={`chatbotControl__grid${canViewLimitations ? "" : " chatbotControl__grid--single"}`}>
          {canViewLimitations ? (
            <section className="glass chatbotControl__panel">
              <div className="chatbotControl__panelTitle">Limitations</div>
              <p className="chatbotControl__panelText">
                Emergency Brake disables chatbot replies. Fact-Checker forces
                answers to come from the knowledge base only.
              </p>

              {loadingSettings ? (
                <div className="chatbotControl__status">Loading settings...</div>
              ) : (
                <>
                  <label className="chatbotControl__toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(settings?.emergencyBrakeEnabled)}
                      disabled={!canEditLimitations}
                      onChange={() => updateSetting("emergencyBrakeEnabled")}
                    />
                    <span className="chatbotControl__switch" />
                    <div>
                      <div className="chatbotControl__toggleTitle">Emergency Brake</div>
                      <div className="chatbotControl__toggleText">
                        Stop all chatbot responses immediately.
                      </div>
                    </div>
                  </label>

                  <label className="chatbotControl__toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(settings?.factCheckerEnabled)}
                      disabled={!canEditLimitations}
                      onChange={() => updateSetting("factCheckerEnabled")}
                    />
                    <span className="chatbotControl__switch" />
                    <div>
                      <div className="chatbotControl__toggleTitle">
                        Fact-Checker (RAG Logic)
                      </div>
                      <div className="chatbotControl__toggleText">
                        Answer only when knowledge sources are found.
                      </div>
                    </div>
                  </label>

                  {settingsError ? (
                    <div className="chatbotControl__error">{settingsError}</div>
                  ) : null}

                  <button
                    type="button"
                    className="btnPrimary chatbotControl__save"
                    onClick={saveSettings}
                    disabled={saving || !canEditLimitations}
                  >
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                  {!canEditLimitations ? (
                    <div className="chatbotControl__status">
                      Only super admins can change limitation settings.
                    </div>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          <section className="glass chatbotControl__panel chatbotControl__panelChat">
            <div className="chatbotControl__panelTitle">Ask the Bot</div>

            <div className="chatbotControl__chatWindow">
              {messages.length === 0 ? (
                <div className="chatbotControl__placeholder">
                  Ask about visiting hours, pharmacy, or clinic services.
                </div>
              ) : (
                messages.map((msg, index) => (
                  <div
                    key={`${msg.role}-${index}`}
                    className={`chatbotControl__bubble chatbotControl__bubble--${msg.role}`}
                  >
                    <div className="chatbotControl__role">
                      {msg.role === "user" ? "YOU" : "ASSISTANT"}
                    </div>
                    <div className="chatbotControl__text">{msg.text}</div>
                    {msg.sources && msg.sources.length > 0 ? (
                      <div className="chatbotControl__sources">
                        Sources: {msg.sources.map((s) => s.title).join(", ")}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <div className="chatbotControl__composer">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about visiting hours, pharmacy, etc."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendQuestion();
                  }
                }}
              />
              <button
                type="button"
                className="btnPrimary"
                onClick={sendQuestion}
                disabled={asking}
              >
                {asking ? "Sending..." : "Send"}
              </button>
            </div>
            {askError ? <div className="chatbotControl__error">{askError}</div> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
