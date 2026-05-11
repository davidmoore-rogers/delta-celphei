import { Router } from "express";
import { requireAuth } from "../../auth/middleware.js";
import { getAsset, searchAssets } from "../../integrations/polaris.js";

export const polarisRouter = Router();
polarisRouter.use(requireAuth);

polarisRouter.get("/assets/search", async (req, res, next): Promise<void> => {
  try {
    const q = (req.query.q as string | undefined) ?? "";
    const limit = Number(req.query.limit ?? 10);
    if (!q.trim()) {
      res.json({ items: [] });
      return;
    }
    const items = await searchAssets(q, Math.min(limit, 50));
    res.json({
      items: items.map((a) => ({
        polarisAssetId: a.id,
        name: (a.name as string) ?? null,
        type: (a.type as string) ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

polarisRouter.get("/assets/:id", async (req, res, next): Promise<void> => {
  try {
    const id = req.params.id as string;
    const a = await getAsset(id);
    if (!a) {
      res.status(404).json({ error: { code: "not_found", message: "Asset not found in Polaris" } });
      return;
    }
    res.json(a);
  } catch (err) {
    next(err);
  }
});
