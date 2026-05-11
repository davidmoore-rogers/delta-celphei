import { env } from "../config/env.js";
import { getPrisma } from "../db/prisma.js";
import { logger } from "../observability/logger.js";

interface PolarisCredentials {
  baseUrl: string;
  apiToken: string;
}

export interface PolarisAsset {
  id: string;
  name?: string;
  type?: string;
  status?: string;
  [key: string]: unknown;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry<unknown>>();

async function getCredentials(): Promise<PolarisCredentials | null> {
  if (env.POLARIS_BASE_URL && env.POLARIS_API_TOKEN) {
    return { baseUrl: env.POLARIS_BASE_URL, apiToken: env.POLARIS_API_TOKEN };
  }
  const row = await getPrisma().integrationConnection.findFirst({
    where: { kind: "polaris", isEnabled: true },
  });
  if (!row) return null;
  const cfg = row.config as { payload?: { baseUrl?: string; apiToken?: string } } | null;
  const baseUrl = cfg?.payload?.baseUrl;
  const apiToken = cfg?.payload?.apiToken;
  if (!baseUrl || !apiToken) return null;
  return { baseUrl, apiToken };
}

async function call<T>(creds: PolarisCredentials, pathQs: string): Promise<T | null> {
  const url = `${creds.baseUrl.replace(/\/$/, "")}${pathQs}`;
  try {
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${creds.apiToken}`,
        Accept: "application/json",
      },
    });
    if (!r.ok) {
      logger.warn({ status: r.status, url }, "polaris call failed");
      return null;
    }
    return (await r.json()) as T;
  } catch (err) {
    logger.warn({ err, url }, "polaris call threw");
    return null;
  }
}

export async function searchAssets(q: string, limit = 10): Promise<PolarisAsset[]> {
  const creds = await getCredentials();
  if (!creds) return [];
  const cacheKey = `search:${q}:${limit}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value as PolarisAsset[];

  const params = new URLSearchParams({ search: q, limit: String(limit) });
  const result = await call<{ items?: PolarisAsset[]; data?: PolarisAsset[] }>(
    creds,
    `/api/v1/assets?${params.toString()}`,
  );
  const items: PolarisAsset[] = result?.items ?? result?.data ?? [];
  cache.set(cacheKey, { value: items, expiresAt: Date.now() + TTL_MS });
  return items;
}

export async function getAsset(id: string): Promise<PolarisAsset | null> {
  const creds = await getCredentials();
  if (!creds) return null;
  const cacheKey = `asset:${id}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value as PolarisAsset;

  const result = await call<PolarisAsset>(creds, `/api/v1/assets/${encodeURIComponent(id)}`);
  if (result) cache.set(cacheKey, { value: result, expiresAt: Date.now() + TTL_MS });
  return result;
}

export function clearPolarisCache(): void {
  cache.clear();
}
