import { useQuery } from "@tanstack/react-query";
import { api, setCsrfToken } from "./api";

export interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
    isActive: boolean;
    federatedFrom: string | null;
    lastLoginAt: string | null;
    createdAt: string;
  };
  csrfToken: string;
}

export function useMe() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const me = await api<MeResponse>("/api/v1/auth/me");
      setCsrfToken(me.csrfToken);
      return me;
    },
    retry: false,
    staleTime: Infinity,
  });
}

export function hasRole(roles: string[] | undefined, ...want: string[]): boolean {
  if (!roles) return false;
  return roles.some((r) => want.includes(r));
}
