const mongoose = require("mongoose");

const ChatbotKnowledgeSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: "" },
    tags: { type: [String], default: [] }
  },
  { timestamps: true, collection: "chatbot_knowledge" }
);

module.exports = mongoose.model("ChatbotKnowledge", ChatbotKnowledgeSchema);
