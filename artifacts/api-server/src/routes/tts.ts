import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/tts", async (req, res) => {
  const { text, voice } = req.body as { text?: string; voice?: string };

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    // Lazy import so missing env vars don't crash API startup
    const { textToSpeech } = await import("@workspace/integrations-openai-ai-server/audio");
    const buffer = await textToSpeech(
      text,
      (voice as "alloy" | "nova" | "shimmer") ?? "nova",
      "mp3"
    );
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "no-cache");
    res.send(buffer);
  } catch (err) {
    console.warn("TTS unavailable, client should fall back to speechSynthesis:", err);
    res.status(503).json({ error: "TTS service unavailable" });
  }
});

export default router;
