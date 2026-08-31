import { z } from "zod";
import { readmatesApiPath } from "@/shared/api/client";

const ClubAccessResultSchema = z.object({
  lastClubAccessAt: z.string().datetime({ offset: true }),
}).strict();

export type ClubAccessResult = z.infer<typeof ClubAccessResultSchema>;

export async function touchClubAccess(clubSlug: string): Promise<ClubAccessResult> {
  const path = readmatesApiPath("/api/me/club-access", { clubSlug });
  const response = await fetch(`/api/bff${path}`, {
    method: "PUT",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Club access touch failed: ${response.status}`);
  }
  return ClubAccessResultSchema.parse(await response.json());
}
