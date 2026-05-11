import { Router } from "express";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { getPrisma } from "../../db/prisma.js";

export const ticketTypesRouter = Router();

ticketTypesRouter.use(requireAuth);

ticketTypesRouter.get("/", async (_req, res, next) => {
  try {
    const types = await getPrisma().ticketType.findMany({
      where: { isActive: true },
      orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
    });
    res.json({
      items: types.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        prefix: t.prefix,
        isBuiltIn: t.isBuiltIn,
        isActive: t.isActive,
        tasksBlockClose: t.tasksBlockClose,
        schema: t.schema,
        workflowConfig: t.workflowConfig,
      })),
    });
  } catch (err) {
    next(err);
  }
});

ticketTypesRouter.get("/:slug", async (req, res, next): Promise<void> => {
  try {
    const slug = req.params.slug as string;
    const t = await getPrisma().ticketType.findUnique({ where: { slug } });
    if (!t) {
      res.status(404).json({ error: { code: "not_found", message: "Ticket type not found" } });
      return;
    }
    res.json({
      id: t.id,
      slug: t.slug,
      name: t.name,
      prefix: t.prefix,
      isBuiltIn: t.isBuiltIn,
      isActive: t.isActive,
      tasksBlockClose: t.tasksBlockClose,
      schema: t.schema,
      workflowConfig: t.workflowConfig,
    });
  } catch (err) {
    next(err);
  }
});

// Phase 2 wires up CRUD; Phase 1 exposes a thin admin patch for tasksBlockClose / schema tweaks.
ticketTypesRouter.patch("/:slug", requireRole("Admin"), async (req, res, next) => {
  try {
    const slug = req.params.slug as string;
    const updated = await getPrisma().ticketType.update({
      where: { slug },
      data: {
        name: req.body.name,
        tasksBlockClose: req.body.tasksBlockClose,
        schema: req.body.schema,
        workflowConfig: req.body.workflowConfig,
        isActive: req.body.isActive,
      },
    });
    res.json({ id: updated.id, slug: updated.slug });
  } catch (err) {
    next(err);
  }
});
