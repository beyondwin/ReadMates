import { QueryClient } from "@tanstack/react-query";
import { ReadMatesSessionExpiredError } from "@/shared/api/client";
import { isReadmatesApiError } from "@/shared/api/errors";
import { installPlatformAdminAuthorityLossHandler } from "@/features/platform-admin/queries/platform-admin-queries";

export function createReadmatesQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          if (error instanceof ReadMatesSessionExpiredError) return false;
          if (isReadmatesApiError(error) && error.status < 500) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
  installPlatformAdminAuthorityLossHandler(queryClient);
  return queryClient;
}
