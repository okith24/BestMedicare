const express = require("express");
const ChatbotSettings = require("../models/ChatbotSettings");
const ChatbotKnowledge = require("../models/ChatbotKnowledge");
const {
  attachAuth,
  requireAuth,
  requireSuperAdmin
} = require("../auth/middleware");

const router = express.Router();

const DEFAULT_SETTINGS = {
  emergencyBrakeEnabled: false,
  ragEnabled: true,
  factCheckerEnabled: true,
  diagnosisGuardEnabled: true
};

const FALLBACK_MESSAGE =
  "I am an administrative assistant and do not have that information. Please contact our help desk for further assistance.";

const EMERGENCY_MESSAGE =
  "Chatbot is temporarily disabled by the emergency brake.";

const DIAGNOSIS_MESSAGE =
  "I am an administrative assistant and can only provide advisory information. I cannot provide diagnosis or medication recommendations. Please book a professional consultation for medical advice.";

async function getSettings() {
  let doc = await ChatbotSettings.findOne({ key: "global" });
  if (!doc) {
    doc = await ChatbotSettings.create({ key: "global", ...DEFAULT_SETTINGS });
  }
  return doc;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "are",
  "is",
  "was",
  "were",
  "what",
  "why",
  "how",
  "when",
  "where",
  "who",
  "which",
  "a",
  "an",
  "to",
  "for",
  "of",
  "in",
  "on",
  "at",
  "with",
  "about",
  "please",
  "clinic",
  "hospital"
]);

const DOMAIN_KEYWORDS = new Set([
  "appointment",
  "appointments",
  "booking",
  "book",
  "register",
  "registration",
  "echanneling",
  "e-channeling",
  "opd",
  "visiting",
  "pharmacy",
  "doctor",
  "schedule",
  "availability",
  "hours",
  "time",
  "fees",
  "service",
  "services"
]);

function tokenize(text) {
  return Array.from(
    new Set(
      normalizeText(text)
        .split(" ")
        .map((word) => word.replace(/[^a-z0-9]/gi, ""))
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    )
  );
}

function isDiagnosisRequest(question) {
  const q = normalizeText(question);
  const patterns = [
    "what should i take",
    "what medicine",
    "which medicine",
    "medication",
    "diagnose",
    "diagnosis",
    "treatment",
    "prescribe",
    "prescription",
    "chest pain",
    "dizziness",
    "shortness of breath",
    "pain and",
    "symptoms"
  ];

  return patterns.some((p) => q.includes(p));
}

async function findKnowledgeMatch(question) {
  const q = normalizeText(question);
  const tokens = tokenize(q);
  if (tokens.length === 0) return null;

  const regexTokens = tokens.slice(0, 8).map((t) => new RegExp(t, "i"));

  let candidates = await ChatbotKnowledge.find(
    {
      $or: [
        { topic: { $in: regexTokens } },
        { content: { $in: regexTokens } },
        { tags: { $in: regexTokens } },
        { category: { $in: regexTokens } }
      ]
    },
    { topic: 1, content: 1, tags: 1, category: 1 }
  ).limit(12);

  if (!candidates.length) {
    candidates = await ChatbotKnowledge.find(
      {},
      { topic: 1, content: 1, tags: 1, category: 1 }
    ).limit(200);
  }

  if (!candidates.length) return null;

  const scoreEntry = (entry) => {
    const topic = normalizeText(entry.topic);
    const content = normalizeText(entry.content);
    const category = normalizeText(entry.category);
    const tags = Array.isArray(entry.tags) ? entry.tags.map(normalizeText) : [];
    let score = 0;
    let topicTagHits = 0;
    let contentHits = 0;
    let domainHit = false;

    if (topic && q.includes(topic)) score += 6;
    if (content && q.includes(content)) score += 3;
    if (category && q.includes(category)) score += 2;

    for (const token of tokens) {
      if (topic.includes(token)) {
        score += 2;
        topicTagHits += 1;
      }
      if (content.includes(token)) {
        score += 1;
        contentHits += 1;
      }
      if (category.includes(token)) {
        score += 1;
        topicTagHits += 1;
      }
      if (tags.some((t) => t.includes(token))) {
        score += 1;
        topicTagHits += 1;
      }
      if (DOMAIN_KEYWORDS.has(token) && content.includes(token)) {
        domainHit = true;
      }
    }

    const passesBoundary =
      topicTagHits > 0 ||
      contentHits >= 2 ||
      (contentHits >= 1 && domainHit);

    return passesBoundary ? score : 0;
  };

  let best = null;
  let bestScore = -1;

  for (const entry of candidates) {
    const score = scoreEntry(entry);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return bestScore > 0 ? best : null;
}

router.get("/settings", attachAuth, requireAuth, async (req, res, next) => {
  try {
    const settings = await getSettings();
    res.json({
      emergencyBrakeEnabled: settings.emergencyBrakeEnabled,
      ragEnabled:
        typeof settings.ragEnabled === "boolean"
          ? settings.ragEnabled
          : settings.factCheckerEnabled,
      factCheckerEnabled: settings.factCheckerEnabled,
      diagnosisGuardEnabled: settings.diagnosisGuardEnabled
    });
  } catch (err) {
    next(err);
  }
});

router.put("/settings", attachAuth, requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const nextSettings = {
      emergencyBrakeEnabled:
        typeof req.body.emergencyBrakeEnabled === "boolean"
          ? req.body.emergencyBrakeEnabled
          : DEFAULT_SETTINGS.emergencyBrakeEnabled,
      ragEnabled:
        typeof req.body.ragEnabled === "boolean"
          ? req.body.ragEnabled
          : typeof req.body.factCheckerEnabled === "boolean"
            ? req.body.factCheckerEnabled
            : DEFAULT_SETTINGS.ragEnabled,
      factCheckerEnabled:
        typeof req.body.factCheckerEnabled === "boolean"
          ? req.body.factCheckerEnabled
          : DEFAULT_SETTINGS.factCheckerEnabled,
      diagnosisGuardEnabled:
        typeof req.body.diagnosisGuardEnabled === "boolean"
          ? req.body.diagnosisGuardEnabled
          : DEFAULT_SETTINGS.diagnosisGuardEnabled
    };

    const updated = await ChatbotSettings.findOneAndUpdate(
      { key: "global" },
      {
        key: "global",
        ...nextSettings,
        updatedBy: String(req.authUser?.email || req.authUser?.name || "")
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      emergencyBrakeEnabled: updated.emergencyBrakeEnabled,
      ragEnabled:
        typeof updated.ragEnabled === "boolean"
          ? updated.ragEnabled
          : updated.factCheckerEnabled,
      factCheckerEnabled: updated.factCheckerEnabled,
      diagnosisGuardEnabled: updated.diagnosisGuardEnabled
    });
  } catch (err) {
    next(err);
  }
});

router.post("/ask", attachAuth, requireAuth, async (req, res, next) => {
  try {
    const question = String(req.body?.question || "").trim();

    if (!question) {
      return res.status(400).json({ message: "Question is required." });
    }

    const settings = await getSettings();

    if (settings.emergencyBrakeEnabled) {
      return res.status(503).json({ message: EMERGENCY_MESSAGE });
    }

    if (settings.diagnosisGuardEnabled && isDiagnosisRequest(question)) {
      return res.json({ answer: DIAGNOSIS_MESSAGE, sources: [] });
    }

    const ragEnabled =
      typeof settings.ragEnabled === "boolean"
        ? settings.ragEnabled
        : settings.factCheckerEnabled;

    if (ragEnabled) {
      const match = await findKnowledgeMatch(question);
      if (!match) {
        return res.json({ answer: FALLBACK_MESSAGE, sources: [] });
      }

      return res.json({
        answer: match.content,
        sources: [{ id: String(match._id), title: match.topic }]
      });
    }

    return res.json({
      answer:
        "RAG is disabled. Please enable it to provide knowledge-based answers.",
      sources: []
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
