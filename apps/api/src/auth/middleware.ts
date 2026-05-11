import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { createHash } from "node:crypto";
import { getPrisma } from "../db/prisma.js";
import { csrfTokensMatch, loadSession, SESSION_COOKIE, type SessionContext } from "./sessions.js";
import { forbidden, unauthorized } from "../middleware/errorHandler.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionContext;
      apiToken?: { userId: string; scopes: string[] };
    }
  }
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function sessionResolver(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authz = req.headers.authorization;
    if (typeof authz === "string" && authz.startsWith("Bearer ")) {
      const token = authz.slice("Bearer ".length).trim();
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const apiToken = await getPrisma().apiToken.findUnique({
        where: { tokenHash },
        include: { user: { include: { roles: true } } },
      });
      if (apiToken && !apiToken.revokedAt && (!apiToken.expiresAt || apiToken.expiresAt > new Date())) {
        req.apiToken = { userId: apiToken.userId, scopes: apiToken.scopes };
        req.session = {
          sessionId: `apitoken:${apiToken.id}`,
          userId: apiToken.userId,
          email: apiToken.user.email,
          displayName: apiToken.user.displayName,
          roles: apiToken.user.roles.map((r) => r.role),
          csrfSecret: "",
        };
        next();
        return;
      }
    }

    const cookieToken = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (cookieToken) {
      const session = await loadSession(cookieToken);
      if (session) req.session = session;
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (req.apiToken) return next();
  if (!MUTATION_METHODS.has(req.method)) return next();
  if (!req.session) return next();
  if (req.path === "/api/v1/auth/login" || req.path === "/api/v1/auth/logout") return next();

  const provided = req.headers["x-csrf-token"];
  if (typeof provided !== "string" || !csrfTokensMatch(provided, req.session.csrfSecret)) {
    return next(forbidden("CSRF token invalid"));
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session) return next(unauthorized());
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.session) return next(unauthorized());
    if (!req.session.roles.some((r) => roles.includes(r))) {
      return next(forbidden(`Requires role: ${roles.join(" or ")}`));
    }
    next();
  };
}

export async function requireManagerOf(req: Request, targetUserId: string): Promise<boolean> {
  if (!req.session) return false;
  if (req.session.roles.includes("Admin")) return true;
  if (!req.session.roles.includes("Manager")) return false;
  const link = await getPrisma().managerReport.findFirst({
    where: { managerId: req.session.userId, reportId: targetUserId },
  });
  return !!link;
}
