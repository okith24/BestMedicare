import React from "react";
import "./chatbot-limitations.css";

export default function ChatbotLimitations() {
  return (
    <section className="chatbot-limitations" aria-label="Gemini chatbot limitations">
      <div className="container chatbot-limitations__inner glass">
        <div className="chatbot-limitations__icon chatbot-limitations__iconFloating" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
            <path
              d="M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.2 3.2A1 1 0 0 1 6 18.4V16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v8h2a1 1 0 0 1 1 1v1.2L10.8 14a1 1 0 0 1 .6-.2h7.6V6H5zm4 3h6a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2z"
              fill="currentColor"
            />
          </svg>
        </div>

        <div className="chatbot-limitations__content">
          <div className="chatbot-limitations__title">Gemini Chatbot Limitations</div>
          <div className="chatbot-limitations__subtitle">
            When using the chatbot, these system limits apply:
          </div>

          <ul className="chatbot-limitations__list">
            <li>The Emergency Brake</li>
            <li>The Fact-Checker (RAG Logic)</li>
            <li>The Safety Filter</li>
            <li>The Confidence Gate</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
