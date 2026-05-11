// Re-export shim — actual implementation lives in src/seed/builtInTypes.ts
// so the bundled `dist/` build can find it without depending on prisma/ at runtime.
export { seedBuiltInTicketTypes } from "../src/seed/builtInTypes.js";
