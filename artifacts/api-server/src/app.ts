import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { aiRateLimit } from "./middlewares/rateLimit";
import { requireApiKey } from "./middlewares/apiKey";

const app: Express = express();

const isProduction = process.env.NODE_ENV === "production";

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : [];

// Replit-hosted domains are always trusted in addition to any explicit
// CORS_ORIGINS. This covers both dev (*.replit.dev / *.worf.replit.dev) and
// production deployments (*.replit.app), so the SPA artifact can call the
// API artifact without manual env configuration.
const REPLIT_HOST_RE = /\.(replit\.app|replit\.dev|repl\.co|worf\.replit\.dev)$/i;
const isReplitOrigin = (origin: string): boolean => {
  try {
    const host = new URL(origin).hostname;
    return REPLIT_HOST_RE.test(host);
  } catch {
    return false;
  }
};

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (!isProduction && allowedOrigins.length === 0) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin) || isReplitOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/classify", aiRateLimit, requireApiKey);
app.use("/api/tts", aiRateLimit, requireApiKey);

app.use("/api", router);

export default app;
