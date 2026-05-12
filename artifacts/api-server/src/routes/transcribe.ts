import { Router, raw, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function pickExtension(contentType: string | undefined, fallback: string): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("webm")) return "webm";
  if (ct.includes("ogg")) return "ogg";
  if (ct.includes("mp4") || ct.includes("m4a") || ct.includes("aac")) return "m4a";
  if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3";
  if (ct.includes("wav")) return "wav";
  return fallback;
}

router.post(
  "/transcribe",
  raw({ type: () => true, limit: "10mb" }),
  async (req, res) => {
    try {
      const buffer = req.body as Buffer;
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        res.status(400).json({ error: "audio body is required" });
        return;
      }
      const ext = pickExtension(req.headers["content-type"] as string | undefined, "webm");
      const startedAt = Date.now();
      const { openai, toFile } = await import("@workspace/integrations-openai-ai-server/audio");
      const file = await toFile(buffer, `audio.${ext}`);
      const response = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
      });
      const text = response.text ?? "";
      logger.info(
        { tag: "transcribe.out", latencyMs: Date.now() - startedAt, ext, bytes: buffer.length, textLen: text.length },
        "↩ transcribe response",
      );
      res.json({ text });
    } catch (err) {
      logger.error({ tag: "transcribe.err", err: (err as Error).message }, "Transcribe error");
      res.status(503).json({ error: "Transcription unavailable", text: "" });
    }
  },
);

export default router;
