import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Lazy client getter — resolves at call time, not import time.
// Returns null and logs a warning if env vars are absent.
type AnthropicModule = typeof import("@workspace/integrations-anthropic-ai");
let _anthropic: AnthropicModule["anthropic"] | null = null;

async function getAnthropicClient() {
  if (_anthropic) return _anthropic;
  try {
    const mod = await import("@workspace/integrations-anthropic-ai");
    _anthropic = mod.anthropic;
    return _anthropic;
  } catch (err) {
    console.warn("Anthropic integration unavailable:", err);
    return null;
  }
}

const INTENT_PROMPT = `You are a voice command classifier for delivery drivers. Given a driver's spoken message, classify it into exactly one of these intents and extract any relevant fields.

Intents:
- road_closed: Driver reports a road or street is closed, blocked, or impassable
- parking_issue: Driver has trouble finding parking, reports a bad parking spot, or updates parking info
- customer_not_home: Customer is not home, not answering, or unavailable
- delivery_complete: Driver has successfully delivered a parcel
- delay_reported: Driver says they will be delayed, late, slowed down, or running behind for one of their parcels (e.g., "I'll be delayed for the next parcel", "running late on delivery 3", "going to be 15 minutes late due to traffic")
- request_map: Driver wants to see the map or navigation ("show me the map", "where do I go", "navigate to", "get directions")
- general: Any other message that doesn't fit the above categories

For the delay_reported intent, also extract:
- parcelRef: which parcel the delay refers to. Use the literal string the driver said: "next" (default if they say "next parcel/stop/delivery"), an ordinal/number like "1", "2", "3" (if they say "delivery 3", "the second one", "stop number 2"), a parcel id like "P003" (if they say it), a street name (if they reference an address), or empty string if unclear.
- minutes: estimated delay in whole minutes (integer) IF the driver mentioned a duration (e.g., "15 minutes" → 15, "an hour" → 60, "half an hour" → 30). Omit or set to null if not mentioned.
- reason: short human-readable phrase for the cause (e.g., "heavy traffic", "flat tire", "accident") IF the driver gave a reason. Omit or set to null if not mentioned.

Respond ONLY with a JSON object in this exact format (no markdown, no explanation). Include parcelRef/minutes/reason ONLY for delay_reported intent:
{
  "intent": "<one of the intents above>",
  "entity": "<extracted street name, customer name, parcel ID, or empty string if not applicable>",
  "parcelRef": "<see above, only for delay_reported>",
  "minutes": <integer or null, only for delay_reported>,
  "reason": "<short phrase or null, only for delay_reported>",
  "confidence": <0.0 to 1.0>
}`;

const DELAY_DETAILS_PROMPT = `You are extracting delay details from a delivery driver's spoken follow-up answer. The driver was just asked: "How long will the delay be, and what happened?".

From the driver's reply, extract:
- minutes: estimated delay in whole minutes (integer). If they say "an hour" use 60. If unclear, default to 10.
- reason: a short human-readable phrase describing the cause (e.g., "heavy traffic", "flat tire", "long customer interaction"). If no reason given, use "unspecified".

Respond ONLY with a JSON object in this exact format (no markdown, no explanation):
{
  "minutes": <integer>,
  "reason": "<short phrase>",
  "confidence": <0.0 to 1.0>
}`;

router.post("/classify", async (req, res) => {
  const { transcript, mode } = req.body as { transcript?: string; mode?: string };
  const startedAt = Date.now();

  if (!transcript || typeof transcript !== "string") {
    res.status(400).json({ error: "transcript is required" });
    return;
  }

  logger.info({ tag: "classify.in", transcript, mode: mode ?? "intent" }, "↪ classify request");

  const anthropic = await getAnthropicClient();

  if (!anthropic) {
    if (mode === "delay_details") {
      res.status(503).json({ error: "AI service unavailable", minutes: 10, reason: "unspecified", confidence: 0 });
    } else {
      res.status(503).json({ error: "AI service unavailable", intent: "general", entity: "", confidence: 0 });
    }
    return;
  }

  const systemPrompt = mode === "delay_details" ? DELAY_DETAILS_PROMPT : INTENT_PROMPT;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      messages: [
        { role: "user", content: `${systemPrompt}\n\nDriver said: ${transcript}` },
      ],
    });

    const block = message.content[0];
    const raw = block.type === "text" ? block.text : "{}";
    const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(text);

    if (mode === "delay_details") {
      const minutes = Number.isFinite(parsed.minutes) ? Math.max(1, Math.round(parsed.minutes)) : 10;
      const out = {
        minutes,
        reason: typeof parsed.reason === "string" && parsed.reason.length > 0 ? parsed.reason : "unspecified",
        confidence: parsed.confidence ?? 0.8,
      };
      logger.info({ tag: "classify.out", mode: "delay_details", transcript, latencyMs: Date.now() - startedAt, ...out }, "↩ classify response");
      res.json(out);
    } else {
      const intent = parsed.intent ?? "general";
      const out: Record<string, unknown> = {
        intent,
        entity: parsed.entity ?? "",
        confidence: parsed.confidence ?? 0.8,
      };
      if (intent === "delay_reported") {
        if (typeof parsed.parcelRef === "string") out.parcelRef = parsed.parcelRef;
        if (Number.isFinite(parsed.minutes)) out.minutes = Math.max(1, Math.round(parsed.minutes));
        if (typeof parsed.reason === "string" && parsed.reason.length > 0) out.reason = parsed.reason;
      }
      logger.info({ tag: "classify.out", mode: "intent", transcript, latencyMs: Date.now() - startedAt, ...out }, "↩ classify response");
      res.json(out);
    }
  } catch (err) {
    logger.error({ tag: "classify.err", transcript, mode, err: (err as Error).message }, "Classify error");
    if (mode === "delay_details") {
      res.status(500).json({ error: "Classification failed", minutes: 10, reason: "unspecified", confidence: 0 });
    } else {
      res.status(500).json({ error: "Classification failed", intent: "general", entity: "", confidence: 0 });
    }
  }
});

export default router;
