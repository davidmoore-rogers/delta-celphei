import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Role } from "@prisma/client";
import { getPrisma } from "../db/prisma.js";

export const SESSION_COOKIE = "__Host-celphei.sid";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface SessionContext {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  roles: Role[];
  csrfSecret: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(input: {
  userId: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
  const prisma = getPrisma();
  const token = newOpaqueToken();
  const csrfToken = newOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId: input.userId,
      csrfSecret: csrfToken,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt,
    },
  });
  return { token, csrfToken, expiresAt };
}

export async function loadSession(token: string): Promise<SessionContext | null> {
  const prisma = getPrisma();
  const id = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      user: { include: { roles: true } },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id } }).catch(() => undefined);
    return null;
  }
  // Sliding expiry — extend on each use.
  const newExpiry = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session
    .update({
      where: { id },
      data: { lastSeenAt: new Date(), expiresAt: newExpiry },
    })
    .catch(() => undefined);
  return {
    sessionId: id,
    userId: session.userId,
    email: session.user.email,
    displayName: session.user.displayName,
    roles: session.user.roles.map((r) => r.role),
    csrfSecret: session.csrfSecret,
  };
}

export async function destroySession(token: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.session.delete({ where: { id: hashToken(token) } }).catch(() => undefined);
}

export function csrfTokensMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
