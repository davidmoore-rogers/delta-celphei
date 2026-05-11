import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { existsSync } from "node:fs";
import path from "node:path";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./observability/logger.js";
import { metricsRegistry } from "./observability/metrics.js";
import { sessionResolver, csrfGuard } from "./auth/middleware.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/v1/auth.js";
import { ticketsRouter } from "./routes/v1/tickets.js";
import { tasksRouter } from "./routes/v1/tasks.js";
import { ticketTypesRouter } from "./routes/v1/ticketTypes.js";
import { usersRouter } from "./routes/v1/users.js";
import { teamsRouter } from "./routes/v1/teams.js";
import { managerReportsRouter } from "./routes/v1/managerReports.js";
import { polarisRouter } from "./routes/v1/polaris.js";
import { searchRouter } from "./routes/v1/search.js";
import { eventsRouter } from "./routes/v1/events.js";
import { settingsRouter } from "./routes/v1/settings.js";
import { apiTokensRouter } from "./routes/v1/apiTokens.js";
import { approvalRulesRouter } from "./routes/v1/approvalRules.js";
import { groupsRouter } from "./routes/v1/groups.js";
import { WEB_DIST } from "./utils/paths.js";

export function buildApp(): Express {
  const app = express();

  if (env.TRUST_PROXY) app.set("trust proxy", true);
  app.disable("x-powered-by");

  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(sessionResolver);
  app.use(csrfGuard);

  // Health endpoint — protected by HEALTH_TOKEN bearer if set.
  app.get("/health", (req, res): void => {
    const required = env.HEALTH_TOKEN;
    if (required && req.headers.authorization !== `Bearer ${required}`) {
      res.status(401).end();
      return;
    }
    res.json({ ok: true, mode: "normal" });
  });

  // Prometheus metrics — protected by METRICS_TOKEN bearer if set.
  if (env.METRICS_ENABLED) {
    app.get("/metrics", async (req, res): Promise<void> => {
      const required = env.METRICS_TOKEN;
      if (required && req.headers.authorization !== `Bearer ${required}`) {
        res.status(401).end();
        return;
      }
      res.set("Content-Type", metricsRegistry.contentType);
      res.end(await metricsRegistry.metrics());
    });
  }

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/tickets", ticketsRouter);
  app.use("/api/v1/tasks", tasksRouter);
  app.use("/api/v1/ticket-types", ticketTypesRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/teams", teamsRouter);
  app.use("/api/v1/manager-reports", managerReportsRouter);
  app.use("/api/v1/polaris", polarisRouter);
  app.use("/api/v1/search", searchRouter);
  app.use("/api/v1/events", eventsRouter);
  app.use("/api/v1/settings", settingsRouter);
  app.use("/api/v1/api-tokens", apiTokensRouter);
  app.use("/api/v1/approval-rules", approvalRulesRouter);
  app.use("/api/v1/groups", groupsRouter);

  // Serve built SPA (apps/web/dist) when present.
  if (existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    app.get("/{*splat}", (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/health") || req.path.startsWith("/metrics")) {
        return next();
      }
      res.sendFile(path.join(WEB_DIST, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}

export async function startApp(port: number): Promise<void> {
  const app = buildApp();
  app.listen(port, () => logger.info({ port }, "celphei api listening"));
}
