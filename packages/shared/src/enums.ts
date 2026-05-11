export const Role = {
  Admin: "Admin",
  Manager: "Manager",
  HelpDesk: "HelpDesk",
  User: "User",
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ALL_ROLES = Object.values(Role) as Role[];

export const TicketStatus = {
  Open: "Open",
  InProgress: "InProgress",
  Pending: "Pending",
  Resolved: "Resolved",
  Closed: "Closed",
  Cancelled: "Cancelled",
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const Priority = {
  P1: "P1",
  P2: "P2",
  P3: "P3",
  P4: "P4",
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const TaskStatus = {
  Open: "Open",
  InProgress: "InProgress",
  Done: "Done",
  Cancelled: "Cancelled",
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const AuthProviderType = {
  Local: "local",
  SAML: "saml",
  OIDC: "oidc",
  LDAP: "ldap",
  Polaris: "polaris",
} as const;
export type AuthProviderType = (typeof AuthProviderType)[keyof typeof AuthProviderType];

export const ManagerReportSource = {
  Manual: "manual",
  Entra: "entra",
  AD: "ad",
} as const;
export type ManagerReportSource = (typeof ManagerReportSource)[keyof typeof ManagerReportSource];

export const EventSeverity = {
  Info: "info",
  Warn: "warn",
  Error: "error",
} as const;
export type EventSeverity = (typeof EventSeverity)[keyof typeof EventSeverity];

export const EventSource = {
  Auth: "auth",
  Ticket: "ticket",
  Task: "task",
  Approval: "approval",
  PolarisSync: "polaris-sync",
  EntraSync: "entra-sync",
  LdapSync: "ldap-sync",
  System: "system",
} as const;
export type EventSource = (typeof EventSource)[keyof typeof EventSource];

export const IntegrationKind = {
  Polaris: "polaris",
  Entra: "entra",
  Intune: "intune",
  Ldap: "ldap",
  Smtp: "smtp",
} as const;
export type IntegrationKind = (typeof IntegrationKind)[keyof typeof IntegrationKind];

export const BUILTIN_TICKET_TYPES = {
  Incident: { slug: "incident", name: "Incident", prefix: "INC" },
  Change: { slug: "change", name: "Change", prefix: "CHG" },
  Request: { slug: "request", name: "Request", prefix: "REQ" },
} as const;
