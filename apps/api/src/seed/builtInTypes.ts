import type { PrismaClient, Prisma } from "@prisma/client";

const INCIDENT_SCHEMA = {
  fields: [
    {
      key: "impact",
      label: "Impact",
      type: "select",
      required: true,
      options: [
        { value: "single", label: "Single user" },
        { value: "team", label: "Team / department" },
        { value: "org", label: "Organization-wide" },
      ],
      defaultValue: "single",
    },
    {
      key: "urgency",
      label: "Urgency",
      type: "select",
      required: true,
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
      defaultValue: "medium",
    },
  ],
};

const CHANGE_SCHEMA = {
  fields: [
    {
      key: "risk",
      label: "Risk",
      type: "select",
      required: true,
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
      defaultValue: "medium",
    },
    {
      key: "changeWindow",
      label: "Change window",
      type: "text",
      required: false,
      helpText: "e.g., 2026-05-12 22:00 – 23:30 UTC",
    },
    {
      key: "rollbackPlan",
      label: "Rollback plan",
      type: "textarea",
      required: true,
    },
  ],
};

const REQUEST_SCHEMA = {
  fields: [
    {
      key: "category",
      label: "Category",
      type: "select",
      required: true,
      options: [
        { value: "hardware", label: "Hardware" },
        { value: "software", label: "Software" },
        { value: "access", label: "Access" },
        { value: "other", label: "Other" },
      ],
      defaultValue: "other",
    },
    {
      key: "justification",
      label: "Justification",
      type: "textarea",
      required: false,
    },
  ],
};

export async function seedBuiltInTicketTypes(prisma: PrismaClient): Promise<void> {
  const types = [
    { slug: "incident", name: "Incident", prefix: "INC", tasksBlockClose: false, schema: INCIDENT_SCHEMA },
    { slug: "change", name: "Change", prefix: "CHG", tasksBlockClose: true, schema: CHANGE_SCHEMA },
    { slug: "request", name: "Request", prefix: "REQ", tasksBlockClose: false, schema: REQUEST_SCHEMA },
  ];

  for (const t of types) {
    await prisma.ticketType.upsert({
      where: { slug: t.slug },
      create: {
        slug: t.slug,
        name: t.name,
        prefix: t.prefix,
        isBuiltIn: true,
        isActive: true,
        tasksBlockClose: t.tasksBlockClose,
        schema: t.schema as Prisma.InputJsonValue,
      },
      update: { name: t.name, isBuiltIn: true },
    });
  }
}
