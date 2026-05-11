import express from "express";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { pinoHttp } from "pino-http";
import { env } from "../config/env.js";
import { logger } from "../observability/logger.js";
import { PUBLIC_DIR } from "../utils/paths.js";
import { buildSetupRouter } from "./setupRoutes.js";

/**
 * Bootstrap-mode Express app. Runs when getSetupState() === "needs-setup".
 * Serves the wizard SPA + /api/setup/* and refuses everything else.
 * No Prisma client, no DB. Atomic finalize creates DB + writes .env + exits.
 */
export function startSetupServer(): void {
  const app = express();

  if (env.TRUST_PROXY) app.set("trust proxy", true);

  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.use("/api/setup", buildSetupRouter());

  // Health for the wizard's post-finalize poller.
  app.get("/health", (req, res): void => {
    const required = process.env.HEALTH_TOKEN;
    if (required && req.headers.authorization !== `Bearer ${required}`) {
      res.status(401).end();
      return;
    }
    res.json({ ok: true, mode: "setup" });
  });

  // Serve wizard static files (if present).
  if (existsSync(PUBLIC_DIR) && statSync(PUBLIC_DIR).isDirectory()) {
    app.use(express.static(PUBLIC_DIR));
    app.get("/{*splat}", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      const indexPath = path.join(PUBLIC_DIR, "setup.html");
      if (existsSync(indexPath)) return res.sendFile(indexPath);
      return next();
    });
  }

  // Default response for any unmatched route — minimal HTML pointer.
  app.use((_req, res) => {
    res.status(200).type("html").send(`<!doctype html>
<html><head><title>Celphei — Setup</title></head>
<body style="font-family:system-ui;max-width:540px;margin:80px auto;padding:0 20px">
<h1>Celphei needs setup</h1>
<p>The setup wizard is not bundled here. Place <code>setup.html</code> in <code>apps/api/public/</code> and reload.</p>
</body></html>`);
  });

  const port = env.PORT;
  app.listen(port, () => {
    logger.info({ port }, "celphei setup wizard listening");
    logger.info(`Open http://localhost:${port}/ to begin setup`);
  });
}
