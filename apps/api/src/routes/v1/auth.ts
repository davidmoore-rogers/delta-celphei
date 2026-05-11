import { Router } from "express";
import { LoginInput } from "@celphei/shared";
import { env } from "../../config/env.js";
import { authenticateLocal, listEnabledProviders } from "../../auth/providers.js";
import { createSession, destroySession, SESSION_COOKIE } from "../../auth/sessions.js";
import { requireAuth } from "../../auth/middleware.js";
import { emitEvent } from "../../events/bus.js";
import { unauthorized } from "../../middleware/errorHandler.js";
import { getPrisma } from "../../db/prisma.js";

export const authRouter = Router();

authRouter.get("/providers", async (_req, res, next) => {
  try {
    const providers = await listEnabledProviders();
    res.json({ providers });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/csrf", requireAuth, (req, res) => {
  // Used by the SPA to fetch the CSRF token after login.
  res.json({ csrfToken: req.session?.csrfSecret });
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session!.userId;
    const user = await getPrisma().user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: true },
    });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles.map((r) => r.role),
        isActive: user.isActive,
        federatedFrom: user.federatedFrom,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      csrfToken: req.session!.csrfSecret,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = LoginInput.parse(req.body);
    const result = await authenticateLocal({ email: input.email, password: input.password });
    if (!result) {
      await emitEvent({
        severity: "warn",
        source: "auth",
        message: `Failed login for ${input.email}`,
      });
      throw unauthorized("Invalid email or password");
    }
    const ip = req.ip ?? null;
    const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;
    const { token, csrfToken, expiresAt } = await createSession({
      userId: result.userId,
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    });
    await getPrisma().user.update({
      where: { id: result.userId },
      data: { lastLoginAt: new Date() },
    });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    await emitEvent({
      severity: "info",
      source: "auth",
      actorId: result.userId,
      message: `Login (local)`,
    });
    res.json({
      user: {
        id: result.userId,
        email: result.email,
        displayName: result.displayName,
        roles: result.roles,
      },
      csrfToken,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) await destroySession(token);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    if (req.session) {
      await emitEvent({
        severity: "info",
        source: "auth",
        actorId: req.session.userId,
        message: "Logout",
      });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
