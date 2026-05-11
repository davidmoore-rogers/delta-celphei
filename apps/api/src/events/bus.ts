import { EventEmitter } from "node:events";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "../db/prisma.js";
import { logger } from "../observability/logger.js";

export interface EventInput {
  severity?: "info" | "warn" | "error";
  source: string;
  actorId?: string | null;
  subject?: string | null;
  message: string;
  data?: Prisma.JsonValue;
}

class EventBus extends EventEmitter {
  emitEvent(payload: EventInput & { id: string; occurredAt: Date }) {
    this.emit("event", payload);
  }
}

export const eventBus = new EventBus();
eventBus.setMaxListeners(100);

export async function emitEvent(input: EventInput): Promise<void> {
  try {
    const created = await getPrisma().event.create({
      data: {
        severity: input.severity ?? "info",
        source: input.source,
        actorId: input.actorId ?? null,
        subject: input.subject ?? null,
        message: input.message,
        data: (input.data ?? {}) as Prisma.InputJsonValue,
      },
    });
    eventBus.emitEvent({
      ...input,
      id: created.id,
      occurredAt: created.occurredAt,
    });
  } catch (err) {
    logger.error({ err, input }, "failed to emit event");
  }
}
