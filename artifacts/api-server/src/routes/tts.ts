import { Router, type IRouter } from "express";
import { textToSpeech } from "@workspace/integrations-openai-ai-server/audio";

const router: IRouter = Router();

router.post("/tts", async (req, res) => {
  const { text, voice } = req.body as { text?: string; voice?: string };

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    const buffer = await textToSpeech(text, (voice as "alloy" | "nova" | "shimmer") ?? "nova", "mp3");
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "no-cache");
    res.send(buffer);
  } catch (err) {
    console.error("TTS error:", err);
    res.status(500).json({ error: "TTS failed" });
  }
});

export default router;
