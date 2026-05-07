import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Lazy client getter — resolves at call time, not import time.
// Returns null and logs a warning if env vars are absent.
let _anthropic: Awaited<ReturnType<typeof import("@workspace/integrations-anthropic-ai")>>["anthropic"] | null = null;

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

const SYSTEM_PROMPT = `You are a voice command classifier for delivery drivers. Given a driver's spoken message, classify it into exactly one of these intents and extract any relevant entity.

Intents:
- road_closed: Driver reports a road or street is closed, blocked, or impassable
- parking_issue: Driver has trouble finding parking, reports a bad parking spot, or updates parking info
- customer_not_home: Customer is not home, not answering, or unavailable
- delivery_complete: Driver has successfully delivered a parcel
- request_map: Driver wants to see the map or navigation ("show me the map", "where do I go", "navigate to", "get directions")
- general: Any other message that doesn't fit the above categories

Respond ONLY with a JSON object in this exact format (no markdown, no explanation):
{
  "intent": "<one of the intents above>",
  "entity": "<extracted street name, customer name, parcel ID, or empty string if not applicable>",
  "confidence": <0.0 to 1.0>
}`;

router.post("/classify", async (req, res) => {
  const { transcript } = req.body as { transcript?: string };

  if (!transcript || typeof transcript !== "string") {
    res.status(400).json({ error: "transcript is required" });
    return;
  }

  const anthropic = await getAnthropicClient();

  if (!anthropic) {
    res.status(503).json({ error: "AI service unavailable", intent: "general", entity: "", confidence: 0 });
    return;
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      messages: [
        { role: "user", content: `${SYSTEM_PROMPT}\n\nDriver said: ${transcript}` },
      ],
    });

    const block = message.content[0];
    const raw = block.type === "text" ? block.text : "{}";
    const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(text);

    res.json({
      intent: parsed.intent ?? "general",
      entity: parsed.entity ?? "",
      confidence: parsed.confidence ?? 0.8,
    });
  } catch (err) {
    console.error("Classify error:", err);
    res.status(500).json({ error: "Classification failed", intent: "general", entity: "", confidence: 0 });
  }
});

export default router;
