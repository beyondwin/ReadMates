import { redirect } from "react-router-dom";
import { readmatesFetch } from "@/shared/api/client";
import type { AuthMeResponse } from "@/shared/api/readmates";
import { canUseMemberApp } from "@/shared/auth/member-app-access";

export type ArchiveMemberAccess = {
  auth: AuthMeResponse;
  allowed: boolean;
};

export async function loadArchiveMemberAuth(): Promise<ArchiveMemberAccess> {
  const auth = await readmatesFetch<AuthMeResponse>("/api/auth/me");

  if (!auth.authenticated) {
    throw redirect("/login");
  }

  return { auth, allowed: canUseMemberApp(auth) };
}
