import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

// In dev: src/utils/paths.ts. In prod: dist/utils/paths.js. Both resolve to apps/api root.
export const API_ROOT = path.resolve(here, "..", "..");

export const STATE_DIR = process.env.STATE_DIR
  ? path.resolve(process.env.STATE_DIR)
  : path.join(API_ROOT, "state");

export const SETUP_COMPLETE_MARKER = path.join(STATE_DIR, ".setup-complete");
export const ENV_FILE = path.join(STATE_DIR, ".env");

export const PUBLIC_DIR = path.join(API_ROOT, "public");
export const WEB_DIST = path.resolve(API_ROOT, "..", "web", "dist");
