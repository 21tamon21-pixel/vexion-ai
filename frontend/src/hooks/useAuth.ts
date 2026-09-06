import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type { AppConfig, User } from "@/types";

export function useAuth() {
  const q = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<User | null>("/auth/me"),
    retry: false,
    staleTime: 30_000,
  });
  return { user: q.data ?? null, loading: q.isLoading, failed: q.isError };
}

export function useAppConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => apiGet<AppConfig>("/config"),
    retry: false,
    staleTime: Infinity,
  });
}

/** The only sanctioned sign-out path: clears the server session AND the client cache. */
export function useEndSession() {
  const qc = useQueryClient();
  return async () => {
    try {
      await apiPost("/auth/logout");
    } finally {
      qc.clear();
    }
  };
}
