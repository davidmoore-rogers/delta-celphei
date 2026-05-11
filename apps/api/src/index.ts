import { env, requireProductionSecrets } from "./config/env.js";
import { logger } from "./observability/logger.js";
import { getSetupState } from "./setup/detectSetup.js";

async function main() {
  const status = getSetupState();
  logger.info({ setup: status.state, fromEnv: status.databaseUrlFromEnv }, "boot");

  if (status.state === "needs-setup") {
    const { startSetupServer } = await import("./setup/setupServer.js");
    startSetupServer();
    return;
  }

  if (status.state === "locked") {
    logger.fatal(
      { marker: status.marker },
      "Setup-complete marker exists but DATABASE_URL is not set. " +
        "Refusing to start. Either restore the .env from state/, or remove " +
        "state/.setup-complete to re-run the wizard (destructive).",
    );
    process.exit(2);
  }

  requireProductionSecrets();

  const { startApp } = await import("./app.js");
  await startApp(env.PORT);
}

main().catch((err) => {
  logger.fatal({ err }, "fatal boot error");
  process.exit(1);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received");
  process.exit(0);
});
process.on("SIGINT", () => {
  logger.info("SIGINT received");
  process.exit(0);
});
