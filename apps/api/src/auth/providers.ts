import type { Role } from "@prisma/client";
import { getPrisma } from "../db/prisma.js";
import { verifyPassword } from "./passwords.js";

export type AuthProviderType = "local" | "saml" | "oidc" | "ldap" | "polaris";

export interface AuthResult {
  userId: string;
  email: string;
  displayName: string;
  roles: Role[];
}

export interface LocalCredentials {
  email: string;
  password: string;
}

export async function authenticateLocal(creds: LocalCredentials): Promise<AuthResult | null> {
  const user = await getPrisma().user.findUnique({
    where: { email: creds.email.toLowerCase() },
    include: { roles: true },
  });
  if (!user || !user.passwordHash || !user.isActive) return null;
  const ok = await verifyPassword(user.passwordHash, creds.password);
  if (!ok) return null;
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles.map((r) => r.role),
  };
}

export interface ProviderListItem {
  id: string;
  type: AuthProviderType;
  name: string;
  isDefault: boolean;
}

/**
 * Returns providers that are visible on the login screen.
 * Local is always present (the wizard creates an admin with a password).
 * Phase 3 will return enabled federated providers from AuthProvider table.
 */
export async function listEnabledProviders(): Promise<ProviderListItem[]> {
  const dbProviders = await getPrisma().authProvider.findMany({
    where: { isEnabled: true },
    orderBy: { name: "asc" },
  });
  const items: ProviderListItem[] = [
    { id: "local", type: "local", name: "Local account", isDefault: dbProviders.length === 0 },
  ];
  for (const p of dbProviders) {
    items.push({ id: p.id, type: p.type as AuthProviderType, name: p.name, isDefault: p.isDefault });
  }
  return items;
}
