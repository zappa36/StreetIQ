import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

const API_KEY = process.env.API_KEY;
const isProduction = process.env.NODE_ENV === "production";

if (!API_KEY) {
  if (isProduction) {
    logger.warn("API_KEY env var is not set — AI endpoints will rely on CORS + rate limiting only");
  } else {
    logger.warn("API_KEY env var is not set — AI endpoints are unprotected (development only)");
  }
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!API_KEY) {
    next();
    return;
  }

  const provided =
    req.headers["x-api-key"] ??
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined);

  if (!provided || provided !== API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
