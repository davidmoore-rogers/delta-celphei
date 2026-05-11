import { PrismaClient } from "@prisma/client";
import { seedBuiltInTicketTypes } from "../src/seed/builtInTypes.js";

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedBuiltInTicketTypes(prisma);
    console.info("Seeded built-in ticket types: Incident, Change, Request");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
