import type { Prisma } from "@prisma/client";
import type { CreateTaskInput, TaskDTO, UpdateTaskInput } from "@celphei/shared";
import { getPrisma } from "../db/prisma.js";
import { emitEvent } from "../events/bus.js";
import { notFound } from "../middleware/errorHandler.js";

type TaskRow = Prisma.TaskGetPayload<{ include: { ticket: { select: { ticketNumber: true } } } }>;

async function nextTaskNumber(tx: Prisma.TransactionClient): Promise<string> {
  // Atomic counter: stash in a setting-style table would be heavier; use a simple
  // SELECT max + 1 inside a tx (safe enough here because we're already in a tx).
  const last = await tx.task.findFirst({
    orderBy: { createdAt: "desc" },
    select: { taskNumber: true },
  });
  let n = 1;
  if (last) {
    const parsed = Number(last.taskNumber.split("-")[1] ?? 0);
    if (Number.isFinite(parsed)) n = parsed + 1;
  }
  return `TSK-${n}`;
}

export async function listTasksForTicket(ticketId: string): Promise<TaskDTO[]> {
  const rows = await getPrisma().task.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
    include: { ticket: { select: { ticketNumber: true } } },
  });
  return rows.map(toTaskDTO);
}

export async function createTask(
  ticketId: string,
  input: CreateTaskInput,
  actorId: string,
): Promise<TaskDTO> {
  const prisma = getPrisma();
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw notFound("Ticket");

  const row = await prisma.$transaction(async (tx) => {
    const taskNumber = await nextTaskNumber(tx);
    return tx.task.create({
      data: {
        taskNumber,
        ticketId,
        title: input.title,
        description: input.description,
        assigneeId: input.assigneeId,
        teamId: input.teamId,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        createdById: actorId,
      },
      include: { ticket: { select: { ticketNumber: true } } },
    });
  });

  await emitEvent({
    source: "task",
    actorId,
    subject: row.taskNumber,
    message: `Created ${row.taskNumber} on ${ticket.ticketNumber}: ${row.title}`,
  });

  return toTaskDTO(row);
}

export async function updateTask(
  taskId: string,
  input: UpdateTaskInput,
  actorId: string,
): Promise<TaskDTO> {
  const prisma = getPrisma();
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) throw notFound("Task");

  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId || null;
  if (input.teamId !== undefined) data.teamId = input.teamId || null;
  if (input.dueAt !== undefined) data.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (input.status !== undefined) {
    data.status = input.status as Prisma.TaskUncheckedUpdateInput["status"];
    if (input.status === "Done" && existing.status !== "Done") data.completedAt = new Date();
    if (input.status !== "Done" && existing.completedAt) data.completedAt = null;
  }

  const row = await prisma.task.update({
    where: { id: taskId },
    data,
    include: { ticket: { select: { ticketNumber: true } } },
  });

  if (input.status && input.status !== existing.status) {
    await emitEvent({
      source: "task",
      actorId,
      subject: row.taskNumber,
      message: `${row.taskNumber} → ${row.status}`,
    });
  }

  return toTaskDTO(row);
}

export async function deleteTask(taskId: string, actorId: string): Promise<void> {
  const prisma = getPrisma();
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) throw notFound("Task");
  await prisma.task.delete({ where: { id: taskId } });
  await emitEvent({
    source: "task",
    actorId,
    subject: existing.taskNumber,
    message: `Deleted ${existing.taskNumber}`,
  });
}

export function toTaskDTO(row: TaskRow): TaskDTO {
  return {
    id: row.id,
    taskNumber: row.taskNumber,
    ticketId: row.ticketId,
    ticketNumber: row.ticket?.ticketNumber,
    title: row.title,
    description: row.description,
    status: row.status,
    assigneeId: row.assigneeId,
    teamId: row.teamId,
    dueAt: row.dueAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
