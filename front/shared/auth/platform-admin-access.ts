import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

export function canUsePlatformAdmin(auth: AuthMeResponse) {
  return auth.authenticated && auth.platformAdmin != null;
}
