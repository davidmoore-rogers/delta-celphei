import { PrismaClient } from "@prisma/client";

let _prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (_prisma) return _prisma;
  _prisma = new PrismaClient();
  return _prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (!_prisma) return;
  await _prisma.$disconnect();
  _prisma = null;
}
