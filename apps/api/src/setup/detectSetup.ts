import { existsSync, readFileSync } from "node:fs";
import { env, hasDatabaseUrl } from "../config/env.js";
import { SETUP_COMPLETE_MARKER } from "../utils/paths.js";

export type SetupState = "configured" | "locked" | "needs-setup";

export interface SetupStatus {
  state: SetupState;
  marker: { configuredAt: string } | null;
  databaseUrlFromEnv: boolean;
}

/**
 * First-run detection — matches Polaris's contract:
 *   1. DATABASE_URL set → "configured" (env wins; GUI install skipped)
 *   2. state/.setup-complete present → "locked" (refuse re-provisioning)
 *   3. Otherwise → "needs-setup"
 */
export function getSetupState(): SetupStatus {
  if (hasDatabaseUrl()) {
    return {
      state: "configured",
      marker: readMarker(),
      databaseUrlFromEnv: true,
    };
  }
  const marker = readMarker();
  if (marker) {
    return { state: "locked", marker, databaseUrlFromEnv: false };
  }
  return { state: "needs-setup", marker: null, databaseUrlFromEnv: false };
}

function readMarker(): { configuredAt: string } | null {
  if (!existsSync(SETUP_COMPLETE_MARKER)) return null;
  try {
    const raw = readFileSync(SETUP_COMPLETE_MARKER, "utf8");
    const parsed = JSON.parse(raw) as { configuredAt?: string };
    return { configuredAt: parsed.configuredAt ?? new Date().toISOString() };
  } catch {
    return { configuredAt: new Date().toISOString() };
  }
}

void env; // ensure env loaded
