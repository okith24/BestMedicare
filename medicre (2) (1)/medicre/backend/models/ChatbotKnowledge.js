// Mongoose model for chatbot knowledge entries.

const mongoose = require("mongoose");

const ChatbotKnowledgeSchema = new mongoose.Schema(
  {
    // Topic/category/tags are the main fields used during knowledge matching.
    topic: { type: String, required: true, trim: true },
    // Some entries use content (plain string), others use responses (array of strings).
    content: { type: String, trim: true, default: "" },
    responses: { type: [String], default: [] },
    category: { type: String, trim: true, default: "" },
    tags: { type: [String], default: [] }
  },
  { timestamps: true, collection: "chatbot_knowledge" }
);

module.exports = mongoose.model("ChatbotKnowledge", ChatbotKnowledgeSchema);
