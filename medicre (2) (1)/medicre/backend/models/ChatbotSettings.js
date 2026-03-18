const mongoose = require("mongoose");

const ChatbotSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, default: "global" },
    emergencyBrakeEnabled: { type: Boolean, default: false },
    ragEnabled: { type: Boolean, default: true },
    factCheckerEnabled: { type: Boolean, default: true },
    diagnosisGuardEnabled: { type: Boolean, default: true },
    updatedBy: { type: String, default: null }
  },
  { timestamps: true, collection: "chatbotsettings" }
);

module.exports = mongoose.model("ChatbotSettings", ChatbotSettingsSchema);
