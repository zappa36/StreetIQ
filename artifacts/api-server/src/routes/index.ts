import { Router, type IRouter } from "express";
import healthRouter from "./health";
import classifyRouter from "./classify";
import ttsRouter from "./tts";
import transcribeRouter from "./transcribe";

const router: IRouter = Router();

router.use(healthRouter);
router.use(classifyRouter);
router.use(ttsRouter);
router.use(transcribeRouter);

export default router;
