import { redirect } from "react-router-dom";
import { readmatesFetch } from "@/shared/api/client";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { canUseHostApp } from "@/shared/auth/member-app-access";

export async function requireHostLoaderAuth(): Promise<AuthMeResponse> {
  const auth = await readmatesFetch<AuthMeResponse>("/api/auth/me");

  if (!auth.authenticated) {
    throw redirect("/login");
  }

  if (!canUseHostApp(auth)) {
    throw redirect("/app");
  }

  return auth;
}
