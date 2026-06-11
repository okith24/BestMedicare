// Mongoose model for chatbot runtime settings.

const mongoose = require("mongoose");

const ChatbotSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, default: "global" },
    // Emergency brake can disable all chatbot responses instantly.
    emergencyBrakeEnabled: { type: Boolean, default: false },
    // RAG/fact-checker mode allows answers only from matched knowledge entries.
    ragEnabled: { type: Boolean, default: true },
    factCheckerEnabled: { type: Boolean, default: true },
    // Diagnosis guard prevents the bot from giving medical diagnosis-style advice.
    diagnosisGuardEnabled: { type: Boolean, default: true },
    updatedBy: { type: String, default: null }
  },
  { timestamps: true, collection: "chatbotsettings" }
);

module.exports = mongoose.model("ChatbotSettings", ChatbotSettingsSchema);

