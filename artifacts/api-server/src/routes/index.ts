import { Router, type IRouter } from "express";
import healthRouter from "./health";
import classifyRouter from "./classify";
import ttsRouter from "./tts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(classifyRouter);
router.use(ttsRouter);

export default router;
