import { Router } from "express";
import { UpdateTaskInput } from "@celphei/shared";
import { requireAuth } from "../../auth/middleware.js";
import { deleteTask, toTaskDTO, updateTask } from "../../services/tasks.js";
import { getPrisma } from "../../db/prisma.js";
import { notFound } from "../../middleware/errorHandler.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await getPrisma().task.findUnique({
      where: { id: req.params.id },
      include: { ticket: { select: { ticketNumber: true } } },
    });
    if (!row) throw notFound("Task");
    res.json(toTaskDTO(row));
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch("/:id", async (req, res, next) => {
  try {
    const input = UpdateTaskInput.parse(req.body);
    const task = await updateTask(req.params.id, input, req.session!.userId);
    res.json(task);
  } catch (err) {
    next(err);
  }
});

tasksRouter.delete("/:id", async (req, res, next) => {
  try {
    await deleteTask(req.params.id, req.session!.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
