import type { Prisma, Priority, TicketStatus } from "@prisma/client";
import {
  type CreateTicketInput,
  type UpdateTicketInput,
  type TicketDTO,
} from "@celphei/shared";
import { getPrisma } from "../db/prisma.js";
import { emitEvent } from "../events/bus.js";
import { badRequest, conflict, notFound } from "../middleware/errorHandler.js";

type TicketWithRels = Prisma.TicketGetPayload<{
  include: {
    type: true;
    assets: true;
    tasks: { select: { id: true; status: true } };
  };
}>;

export async function createTicket(input: CreateTicketInput, actorId: string): Promise<TicketDTO> {
  const prisma = getPrisma();
  const type = await prisma.ticketType.findUnique({ where: { slug: input.typeSlug } });
  if (!type) throw badRequest(`Unknown ticket type: ${input.typeSlug}`);
  if (!type.isActive) throw badRequest(`Ticket type ${input.typeSlug} is inactive`);

  const ticket = await prisma.$transaction(async (tx) => {
    const updated = await tx.ticketType.update({
      where: { id: type.id },
      data: { nextNumber: { increment: 1 } },
      select: { nextNumber: true, prefix: true },
    });
    const seq = updated.nextNumber - 1;
    const ticketNumber = `${updated.prefix}-${seq}`;

    const t = await tx.ticket.create({
      data: {
        ticketNumber,
        typeId: type.id,
        title: input.title,
        description: input.description,
        priority: input.priority as Priority,
        requesterId: actorId,
        assigneeId: input.assigneeId,
        teamId: input.teamId,
        customFields: input.customFields as Prisma.InputJsonValue,
      },
      include: {
        type: true,
        assets: true,
        tasks: { select: { id: true, status: true } },
      },
    });

    if (input.assetIds.length > 0) {
      await tx.polarisAssetRef.createMany({
        data: input.assetIds.map((id) => ({
          ticketId: t.id,
          polarisAssetId: id,
        })),
        skipDuplicates: true,
      });
    }

    await tx.ticketHistory.create({
      data: {
        ticketId: t.id,
        actorId,
        action: "created",
        changes: { title: t.title, status: t.status, priority: t.priority },
      },
    });

    return t;
  });

  await emitEvent({
    source: "ticket",
    actorId,
    subject: ticket.ticketNumber,
    message: `Created ${ticket.ticketNumber}: ${ticket.title}`,
  });

  return toTicketDTO(ticket as TicketWithRels);
}

export async function updateTicket(
  id: string,
  input: UpdateTicketInput,
  actorId: string,
): Promise<TicketDTO> {
  const prisma = getPrisma();
  const existing = await prisma.ticket.findUnique({
    where: { id },
    include: { type: true, tasks: { select: { status: true } } },
  });
  if (!existing) throw notFound("Ticket");

  const tasksOpen = existing.tasks.filter((t) => t.status !== "Done" && t.status !== "Cancelled");
  if (input.status === "Closed" && existing.type.tasksBlockClose && tasksOpen.length > 0) {
    throw conflict(
      `Cannot close ${existing.ticketNumber}: ${tasksOpen.length} task(s) still open and ticket type requires all tasks complete`,
    );
  }

  const changes: Prisma.JsonObject = {};
  const data: Prisma.TicketUncheckedUpdateInput = {};
  if (input.title !== undefined && input.title !== existing.title) {
    data.title = input.title;
    changes.title = { from: existing.title, to: input.title };
  }
  if (input.description !== undefined && input.description !== existing.description) {
    data.description = input.description;
    changes.description = { changed: true };
  }
  if (input.priority !== undefined && input.priority !== existing.priority) {
    data.priority = input.priority as Priority;
    changes.priority = { from: existing.priority, to: input.priority };
  }
  if (input.status !== undefined && input.status !== existing.status) {
    data.status = input.status as TicketStatus;
    changes.status = { from: existing.status, to: input.status };
    if (input.status === "Closed") data.closedAt = new Date();
    if (input.status !== "Closed" && existing.closedAt) data.closedAt = null;
  }
  if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId) {
    data.assigneeId = input.assigneeId || null;
    changes.assigneeId = { from: existing.assigneeId, to: input.assigneeId };
  }
  if (input.teamId !== undefined && input.teamId !== existing.teamId) {
    data.teamId = input.teamId || null;
    changes.teamId = { from: existing.teamId, to: input.teamId };
  }
  if (input.customFields !== undefined) {
    data.customFields = input.customFields as Prisma.InputJsonValue;
    changes.customFields = { changed: true };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.ticket.update({
      where: { id },
      data,
      include: {
        type: true,
        assets: true,
        tasks: { select: { id: true, status: true } },
      },
    });
    if (Object.keys(changes).length > 0) {
      await tx.ticketHistory.create({
        data: { ticketId: id, actorId, action: "updated", changes },
      });
    }
    if (input.assetIds !== undefined) {
      await tx.polarisAssetRef.deleteMany({ where: { ticketId: id } });
      if (input.assetIds.length > 0) {
        await tx.polarisAssetRef.createMany({
          data: input.assetIds.map((aid) => ({ ticketId: id, polarisAssetId: aid })),
          skipDuplicates: true,
        });
      }
    }
    return u;
  });

  if (changes.status) {
    await emitEvent({
      source: "ticket",
      actorId,
      subject: updated.ticketNumber,
      message: `${updated.ticketNumber} → ${updated.status}`,
    });
  }

  return toTicketDTO(updated);
}

export async function getTicket(id: string): Promise<TicketDTO> {
  const t = await getPrisma().ticket.findUnique({
    where: { id },
    include: { type: true, assets: true, tasks: { select: { id: true, status: true } } },
  });
  if (!t) throw notFound("Ticket");
  return toTicketDTO(t);
}

export async function getTicketByNumber(ticketNumber: string): Promise<TicketDTO> {
  const t = await getPrisma().ticket.findUnique({
    where: { ticketNumber },
    include: { type: true, assets: true, tasks: { select: { id: true, status: true } } },
  });
  if (!t) throw notFound("Ticket");
  return toTicketDTO(t);
}

export async function listTickets(args: {
  q?: string;
  status?: string;
  priority?: string;
  typeSlug?: string;
  assigneeId?: string;
  requesterId?: string;
  teamId?: string;
  scope: "all" | "mine" | "assigned" | "team";
  page: number;
  pageSize: number;
  currentUserId: string;
}): Promise<{ total: number; page: number; pageSize: number; items: TicketDTO[] }> {
  const prisma = getPrisma();
  const where: Prisma.TicketWhereInput = {};
  if (args.scope === "mine") where.requesterId = args.currentUserId;
  if (args.scope === "assigned") where.assigneeId = args.currentUserId;
  if (args.requesterId) where.requesterId = args.requesterId;
  if (args.assigneeId) where.assigneeId = args.assigneeId;
  if (args.teamId) where.teamId = args.teamId;
  if (args.status) where.status = args.status as TicketStatus;
  if (args.priority) where.priority = args.priority as Priority;
  if (args.typeSlug) where.type = { slug: args.typeSlug };
  if (args.q) {
    where.OR = [
      { title: { contains: args.q, mode: "insensitive" } },
      { ticketNumber: { contains: args.q, mode: "insensitive" } },
      { description: { contains: args.q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
      include: {
        type: true,
        assets: true,
        tasks: { select: { id: true, status: true } },
      },
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    total,
    page: args.page,
    pageSize: args.pageSize,
    items: items.map(toTicketDTO),
  };
}

export function toTicketDTO(t: TicketWithRels): TicketDTO {
  const totalTasks = t.tasks.length;
  const openTasks = t.tasks.filter((x) => x.status !== "Done" && x.status !== "Cancelled").length;
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    typeId: t.typeId,
    typeSlug: t.type.slug,
    typeName: t.type.name,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    requesterId: t.requesterId,
    assigneeId: t.assigneeId,
    teamId: t.teamId,
    customFields: (t.customFields as Record<string, unknown>) ?? {},
    assets: t.assets.map((a) => ({
      polarisAssetId: a.polarisAssetId,
      cachedName: a.cachedName,
      cachedType: a.cachedType,
      lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
    })),
    taskCounts: { total: totalTasks, open: openTasks, done: totalTasks - openTasks },
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    closedAt: t.closedAt?.toISOString() ?? null,
  };
}

