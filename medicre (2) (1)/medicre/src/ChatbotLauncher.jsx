import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./chatbot-launcher.css";

export default function ChatbotLauncher({ variant = "floating" }) {
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname === "/chatbot-control") {
    return null;
  }

  const isHeader = variant === "header";

  return (
    <button
      type="button"
      className={`chatbot-launcher${isHeader ? " chatbot-launcher--header" : ""}`}
      onClick={() => navigate("/chatbot-control")}
      aria-label="Open chatbot control room"
    >
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
        <path
          d="M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.2 3.2A1 1 0 0 1 6 18.4V16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v8h2a1 1 0 0 1 1 1v1.2L10.8 14a1 1 0 0 1 .6-.2h7.6V6H5zm4 3h6a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
