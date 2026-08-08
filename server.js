import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.static(__dirname));
app.use(express.json({ limit: "2mb" }));

// ─────────────────────────────────────────────────────────────
// HELPER: Safe JSON Parser (4-strategy fallback)
// AI response kabhi bhi malformed aa sakti hai — yeh kabhi crash nahi hoga
// ─────────────────────────────────────────────────────────────
function safeParseJSON(raw) {
  if (!raw || typeof raw !== "string") return null;

  // Strategy 1: Remove markdown fences + direct parse
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();

  try { return JSON.parse(cleaned); } catch (_) {}

  // Strategy 2: Extract first { ... } block
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch (_) {}
  }

  // Strategy 3: Fix trailing commas and retry
  const fixedComma = cleaned.replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(fixedComma); } catch (_) {}

  // Strategy 4: Extract { ... } from comma-fixed string
  const objMatch2 = fixedComma.match(/\{[\s\S]*\}/);
  if (objMatch2) {
    try { return JSON.parse(objMatch2[0]); } catch (_) {}
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// HELPER: Fetch with Retry (3 attempts, auto back-off)
// 429 / transient network errors pe automatic retry
// ─────────────────────────────────────────────────────────────
async function fetchWithRetry(url, options, retries = 3, delayMs = 1200) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 && attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs * attempt));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
}

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT — World-Class Resume Analysis Engine
// AI simultaneously acts as: ATS System + HR Recruiter +
// Hiring Manager + Resume Consultant + Career Coach
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are simultaneously acting as:
- An enterprise ATS (Applicant Tracking System)
- A Senior HR Recruiter with 15+ years of experience
- A Hiring Manager evaluating technical depth
- A Professional Resume Consultant
- A Career Coach focused on career growth

Your job is to deeply analyze the provided resume across ALL of these dimensions:
1. ATS Compatibility
2. Resume Structure & Formatting
3. Skills Coverage (Technical + Soft)
4. Experience Quality & Relevance
5. Project Quality
6. Education Quality
7. Certifications & Leadership Indicators
8. Quantified Achievements & Business Impact
9. Keyword Coverage & Job Description Matching
10. Overall Hire Readiness

═══════════════════════════════════════
SCORING LOGIC (scores must reflect actual resume content — never random)
═══════════════════════════════════════

ATS Score (0-100):
  Contact Info (10%) + Resume Structure (20%) + Skills Section (20%) +
  Experience Section (20%) + Education (10%) + Keyword Density (10%) +
  Formatting Compatibility (5%) + JD Alignment if provided (5%)

Strength Score (0-100):
  Experience Relevance (30%) + Technical Skills (25%) +
  Project Quality (20%) + Resume Completeness (15%) + Skill Depth (10%)

Impact Score (0-100):
  Quantified Achievements with Metrics (40%) + Business Results (25%) +
  Leadership Indicators (20%) + Outcome-Based Contributions (15%)

═══════════════════════════════════════
JOB DESCRIPTION MATCHING (when JD is provided)
═══════════════════════════════════════
- Extract required skills, keywords, technologies, role expectations
- Compare against resume
- Detect missing keywords and skills
- Adjust ATS score and Job Description Alignment score accordingly
- Generate ATS-specific recommendations

═══════════════════════════════════════
OUTPUT — RETURN ONLY VALID JSON — NO MARKDOWN — NO TEXT OUTSIDE JSON
═══════════════════════════════════════

Return EXACTLY this schema:

{
  "ats_score": <integer 0-100>,
  "strength_score": <integer 0-100>,
  "impact_score": <integer 0-100>,

  "ats_description": "<one label: Excellent | Good | Average | Poor>",
  "strength_description": "<one label: Strong | Moderate | Weak>",
  "impact_description": "<one label: High | Medium | Low>",

  "summary": "<3-4 sentence professional summary: strengths, weaknesses, ATS readiness, hire readiness>",

  "skills_found": ["<skill1>", "<skill2>"],
  "skills_missing": ["<missing skill 1>", "<missing skill 2>"],
  "skills_suggested": ["<trending skill 1>", "<trending skill 2>"],

  "ats_breakdown": [
    { "label": "Contact Information",       "score": <0-100> },
    { "label": "Resume Structure",          "score": <0-100> },
    { "label": "Skills Section",            "score": <0-100> },
    { "label": "Experience Section",        "score": <0-100> },
    { "label": "Education Section",         "score": <0-100> },
    { "label": "Keyword Optimization",      "score": <0-100> },
    { "label": "Formatting Compatibility",  "score": <0-100> },
    { "label": "Job Description Alignment", "score": <0-100> }
  ],

  "suggestions": [
    {
      "type": "critical",
      "title": "<short title>",
      "description": "<specific, actionable advice — mention exact section, keyword, or metric>"
    },
    {
      "type": "improve",
      "title": "<short title>",
      "description": "<specific advice>"
    },
    {
      "type": "tip",
      "title": "<short title>",
      "description": "<specific advice>"
    }
  ]
}

Rules:
- Provide 5-6 suggestions minimum. Mix of critical / improve / tip types.
- suggestions must be specific and prioritized — no generic advice.
- skills_missing: actual skills absent from resume (max 6).
- skills_suggested: trending skills worth adding (max 4).
- skills_found: only skills explicitly present in the resume.
- If no job description: set Job Description Alignment score based on general market fit.`;

// ─────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ─────────────────────────────────────────────────────────────
// POST /api/analyze — Main Resume Analyzer Endpoint
// ─────────────────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  try {
    const { textContent, jobDescription } = req.body;

    if (!textContent || typeof textContent !== "string" || textContent.trim().length === 0) {
      return res.status(400).json({ error: "textContent is required" });
    }

    if (!process.env.API_KEY) {
      return res.status(503).json({ error: "Analysis service is not configured. Add API_KEY to the server environment." });
    }

    // Build user message
    const userMessage = jobDescription
      ? `Analyze this resume:\n\n${textContent}\n\nJob Description to match against:\n\n${jobDescription}\n\nReturn JSON only.`
      : `Analyze this resume:\n\n${textContent}\n\nReturn JSON only.`;

    // OpenRouter API call — optimized for stable JSON output
    const openRouterRes = await fetchWithRetry(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.API_KEY}`,
          "HTTP-Referer": "https://resumeinsight.ai",
          "X-Title": "ResumeInsight AI"
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user",   content: userMessage   }
          ],
          temperature: 0.2,           // Low = deterministic, consistent JSON output
          top_p: 0.9,
          max_tokens: 600,           // Faster response (smaller output = quicker results)
          response_format: { type: "json_object" }  // Force strict JSON mode
        }),
        signal: AbortSignal.timeout(25_000)          // Fast failure instead of a long wait
      },
      2,   // One retry for temporary provider errors
      500  // short backoff
    );

    const openRouterData = await openRouterRes.json();

    console.log("🔵 OpenRouter Response:");
    console.log(JSON.stringify(openRouterData, null, 2));

    if (!openRouterRes.ok) {
      return res.status(openRouterRes.status).json({
        error: openRouterData.error?.message || "OpenRouter API Error"
      });
    }

    const rawResult = openRouterData.choices?.[0]?.message?.content;

    if (!rawResult || rawResult.trim().length === 0) {
      return res.status(500).json({ error: "AI returned empty response" });
    }

    // Safe JSON parsing — 4-strategy fallback, never crashes
    const parsed = safeParseJSON(rawResult);

    if (!parsed) {
      console.error("❌ JSON parse failed. Raw output:\n", rawResult);
      return res.status(500).json({
        error: "AI response could not be parsed. Please try again."
      });
    }

    // Sanitize all fields — frontend crash prevention
    const safe = {
      ats_score:            Number(parsed.ats_score)            || 0,
      strength_score:       Number(parsed.strength_score)       || 0,
      impact_score:         Number(parsed.impact_score)         || 0,
      ats_description:      parsed.ats_description              || "N/A",
      strength_description: parsed.strength_description         || "N/A",
      impact_description:   parsed.impact_description           || "N/A",
      summary:              parsed.summary                      || "Analysis complete.",
      skills_found:         Array.isArray(parsed.skills_found)      ? parsed.skills_found      : [],
      skills_missing:       Array.isArray(parsed.skills_missing)    ? parsed.skills_missing    : [],
      skills_suggested:     Array.isArray(parsed.skills_suggested)  ? parsed.skills_suggested  : [],
      ats_breakdown:        Array.isArray(parsed.ats_breakdown)     ? parsed.ats_breakdown     : [],
      suggestions:          Array.isArray(parsed.suggestions)       ? parsed.suggestions       : []
    };

    res.json({ success: true, result: JSON.stringify(safe) });

  } catch (err) {
    console.error("❌ Server Error:", err);

    // Timeout error handling
    if (err.name === "TimeoutError" || err.code === "UND_ERR_CONNECT_TIMEOUT") {
      return res.status(504).json({ error: "Request timed out. Please try again." });
    }

    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.clear();
  console.log("✅ Backend Started Successfully!");
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log("🚀 API is Ready");
});
