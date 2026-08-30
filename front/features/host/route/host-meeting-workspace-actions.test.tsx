import { readFileSync } from "node:fs";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createGlobalSpaceTransitionCoordinator } from "@/src/app/global-space-transition";
import { SpaceTransitionSafetyProvider } from "@/shared/ui/space-transition-safety-context";
import { TransitionOwnerObsoleteError } from "@/shared/ui/use-transition-safety-owner";
import { useHostMeetingWorkspaceActions } from "./host-meeting-workspace-actions";

const queryMocks = vi.hoisted(() => ({
  commitImport: vi.fn(),
  publishImport: vi.fn(),
  unusedMutation: vi.fn(),
}));

vi.mock("@/features/host/queries/host-session-queries", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/host/queries/host-session-queries")>(),
  publishHostSessionImport: queryMocks.publishImport,
  useCloseHostSessionMutation: () => ({ mutateAsync: queryMocks.unusedMutation }),
  useCommitHostSessionImportMutation: () => ({ mutateAsync: queryMocks.commitImport }),
  useCreateHostSessionMutation: () => ({ mutateAsync: queryMocks.unusedMutation }),
  useDeleteHostSessionMutation: () => ({ mutateAsync: queryMocks.unusedMutation }),
  useOpenHostSessionMutation: () => ({ mutateAsync: queryMocks.unusedMutation }),
  usePublishHostSessionMutation: () => ({ mutateAsync: queryMocks.unusedMutation }),
  useReopenHostSessionMutation: () => ({ mutateAsync: queryMocks.unusedMutation }),
  useRestoreHostSessionMutation: () => ({ mutateAsync: queryMocks.unusedMutation }),
  useReturnHostSessionToDraftMutation: () => ({ mutateAsync: queryMocks.unusedMutation }),
  useSaveHostSessionAccessScopeMutation: () => ({ mutateAsync: queryMocks.unusedMutation }),
  useUnpublishHostSessionMutation: () => ({ mutateAsync: queryMocks.unusedMutation }),
  useUpdateHostSessionAttendanceMutation: () => ({ mutateAsync: queryMocks.unusedMutation }),
  useUpdateHostSessionMutation: () => ({ mutateAsync: queryMocks.unusedMutation }),
}));

function renderActions(onSessionRecordsChanged = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const coordinator = createGlobalSpaceTransitionCoordinator();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SpaceTransitionSafetyProvider port={coordinator}>{children}</SpaceTransitionSafetyProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => useHostMeetingWorkspaceActions(
    { clubSlug: "reading-sai" },
    onSessionRecordsChanged,
  ), { wrapper });
  return { ...hook, coordinator, onSessionRecordsChanged };
}

describe("host meeting workspace action adapter", () => {
  it("registers every command and publishes only through explicit query publishers", () => {
    const source = readFileSync("features/host/route/host-meeting-workspace-actions.ts", "utf8");
    expect(source).toContain("useTransitionSafetyOwner");
    expect(source).toMatch(/settle\("succeeded"\)[\s\S]*await publish/);
    for (const publisher of [
      "publishHostSessionCreated", "publishHostSessionResponse", "publishDeletedHostSession",
      "publishRestoredHostSession", "publishHostSessionAttendance", "publishHostSessionImport",
      "publishHostSessionVisibility",
    ]) expect(source).toContain(publisher);
  });

  it("publishes no record callback after accepted import unmounts during delayed cache publication", async () => {
    const result = { imported: true };
    queryMocks.commitImport.mockResolvedValue(result);
    let releaseCache!: () => void;
    queryMocks.publishImport.mockReturnValue(new Promise<void>((resolve) => { releaseCache = resolve; }));
    const { result: actions, unmount, onSessionRecordsChanged } = renderActions();

    let request!: ReturnType<typeof actions.current.commitSessionImport>;
    act(() => {
      request = actions.current.commitSessionImport("session-1", {} as never);
    });
    await vi.waitFor(() => expect(queryMocks.publishImport).toHaveBeenCalledTimes(1));
    unmount();
    releaseCache();

    await expect(request).rejects.toBeInstanceOf(TransitionOwnerObsoleteError);
    expect(onSessionRecordsChanged).not.toHaveBeenCalled();
  });
});
