import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import { archiveKeys } from "@/features/archive/queries/archive-queries";
import { currentSessionKeys } from "@/features/current-session/queries/current-session-queries";
import { feedbackKeys } from "@/features/feedback/queries/feedback-queries";
import { publicKeys } from "@/features/public/queries/public-queries";
import { useSessionRecordsChangedInvalidation } from "./host-route-invalidation";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: 0 },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

describe("useSessionRecordsChangedInvalidation", () => {
  it("invalidates current session, archive, feedback, and public club queries for the same club", async () => {
    const { client, Wrapper } = createWrapper();
    const clubSlug = "reading-sai";
    const context = { clubSlug };
    const selected = {
      current: currentSessionKeys.current(context),
      archive: archiveKeys.list(context),
      feedback: feedbackKeys.document("session-7", context),
      publicClub: publicKeys.club(clubSlug),
      publicSession: publicKeys.session(clubSlug, "session-7"),
    };
    const other = {
      current: currentSessionKeys.current({ clubSlug: "other-club" }),
      archive: archiveKeys.list({ clubSlug: "other-club" }),
      feedback: feedbackKeys.document("session-7", { clubSlug: "other-club" }),
      publicClub: publicKeys.club("other-club"),
    };
    client.setQueryData(selected.current, { currentSession: { sessionId: "session-7" } });
    client.setQueryData(selected.archive, { sessions: { items: ["session-7"] } });
    client.setQueryData(selected.feedback, { fileName: "session-7.md" });
    client.setQueryData(selected.publicClub, { sessions: ["session-7"] });
    client.setQueryData(selected.publicSession, { sessionId: "session-7", state: "PUBLISHED" });
    client.setQueryData(other.current, { currentSession: { sessionId: "other-session" } });
    client.setQueryData(other.archive, { sessions: { items: ["other-session"] } });
    client.setQueryData(other.feedback, { fileName: "other-session.md" });
    client.setQueryData(other.publicClub, { sessions: ["other-session"] });

    const { result } = renderHook(() => useSessionRecordsChangedInvalidation(), { wrapper: Wrapper });
    await result.current({ sessionId: "session-7", clubSlug });

    for (const key of Object.values(selected)) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    for (const key of Object.values(other)) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
    }
  });
});
