import { redirect } from "react-router-dom";
import { readmatesFetch } from "@/shared/api/client";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

export async function requireHostLoaderAuth(): Promise<AuthMeResponse> {
  const auth = await readmatesFetch<AuthMeResponse>("/api/auth/me");

  if (!auth.authenticated) {
    throw redirect("/login");
  }

  if (auth.role !== "HOST" || auth.approvalState !== "ACTIVE") {
    throw redirect("/app");
  }

  return auth;
}
