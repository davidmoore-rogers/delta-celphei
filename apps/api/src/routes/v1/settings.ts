import { Router } from "express";
import { UpdateSettingInput } from "@celphei/shared";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { getPrisma } from "../../db/prisma.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get("/customization", async (_req, res, next) => {
  try {
    const s = await getPrisma().setting.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    res.json({
      orgName: s.orgName,
      logoUrl: s.logoUrl,
      primaryColor: s.primaryColor,
      loginBanner: s.loginBanner,
      defaultTimeZone: s.defaultTimeZone,
      setupCompleted: s.setupCompleted,
    });
  } catch (err) {
    next(err);
  }
});

settingsRouter.patch("/customization", requireRole("Admin"), async (req, res, next) => {
  try {
    const input = UpdateSettingInput.parse(req.body);
    const s = await getPrisma().setting.update({
      where: { id: 1 },
      data: {
        orgName: input.orgName,
        primaryColor: input.primaryColor,
        loginBanner: input.loginBanner,
        defaultTimeZone: input.defaultTimeZone,
      },
    });
    res.json({
      orgName: s.orgName,
      logoUrl: s.logoUrl,
      primaryColor: s.primaryColor,
      loginBanner: s.loginBanner,
      defaultTimeZone: s.defaultTimeZone,
      setupCompleted: s.setupCompleted,
    });
  } catch (err) {
    next(err);
  }
});
