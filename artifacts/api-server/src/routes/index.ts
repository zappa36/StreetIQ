import { Router, type IRouter } from "express";
import healthRouter from "./health";
import classifyRouter from "./classify";

const router: IRouter = Router();

router.use(healthRouter);
router.use(classifyRouter);

export default router;
