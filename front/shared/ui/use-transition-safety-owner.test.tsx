import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createGlobalSpaceTransitionCoordinator } from "@/src/app/global-space-transition";
import { SpaceTransitionSafetyProvider } from "./space-transition-safety-context";
import {
  publishTransitionAction,
  useTransitionSafetyOwner,
} from "./use-transition-safety-owner";

describe("useTransitionSafetyOwner", () => {
  it("unregisters active handles on unmount and gates publication on accepted settlement", async () => {
    const coordinator = createGlobalSpaceTransitionCoordinator();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SpaceTransitionSafetyProvider port={coordinator}>{children}</SpaceTransitionSafetyProvider>
    );
    const { result, unmount } = renderHook(() => useTransitionSafetyOwner("owner"), { wrapper });
    const handle = result.current.begin("operation", "L1", async () => ({ operationId: "operation", outcome: "still-unknown" }));
    expect(coordinator.getSnapshot().kind).toBe("pending");
    expect(await handle.settle("succeeded")).toBe("accepted");
    const publication = vi.fn();
    expect(handle.publishAccepted({ surface: "ui", publish: publication })).toBe("published");
    expect(publication).toHaveBeenCalledTimes(1);
    act(() => unmount());
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
  });

  it("registers and clears dirty state from a boolean projection", () => {
    const coordinator = createGlobalSpaceTransitionCoordinator();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SpaceTransitionSafetyProvider port={coordinator}>{children}</SpaceTransitionSafetyProvider>
    );
    const { rerender, unmount } = renderHook(
      ({ dirty }) => useTransitionSafetyOwner("owner", dirty, "저장되지 않은 변경"),
      { initialProps: { dirty: true }, wrapper },
    );
    expect(coordinator.getSnapshot()).toEqual({ kind: "dirty", message: "저장되지 않은 변경" });
    rerender({ dirty: false });
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
    unmount();
  });

  it("invokes async publication only through the current accepted handle", async () => {
    const published = vi.fn(async () => "done");
    const acceptedHandle = {
      publishAccepted: vi.fn(({ publish }) => {
        publish({ operationId: "operation", outcome: "succeeded" });
        return "published" as const;
      }),
    };
    const obsoleteHandle = {
      publishAccepted: vi.fn(() => "rejected" as const),
    };

    await expect(publishTransitionAction(acceptedHandle as never, "cache", published)).resolves.toBe("done");
    await expect(publishTransitionAction(obsoleteHandle as never, "errorCopy", published)).rejects.toMatchObject({
      name: "TransitionOwnerObsoleteError",
    });
    expect(published).toHaveBeenCalledTimes(1);
  });

  it("invalidates an accepted handle on unmount while an async publication is delayed", async () => {
    const coordinator = createGlobalSpaceTransitionCoordinator();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SpaceTransitionSafetyProvider port={coordinator}>{children}</SpaceTransitionSafetyProvider>
    );
    const { result, unmount } = renderHook(() => useTransitionSafetyOwner("owner"), { wrapper });
    const handle = result.current.begin("operation", "L1", async () => ({
      operationId: "operation",
      outcome: "still-unknown",
    }));
    await expect(handle.settle("succeeded")).resolves.toBe("accepted");
    let releasePublication!: () => void;
    const delayed = new Promise<void>((resolve) => { releasePublication = resolve; });
    const cachePublication = publishTransitionAction(handle, "cache", async () => {
      await delayed;
      return "observed";
    });

    act(() => unmount());
    releasePublication();

    await expect(cachePublication).rejects.toMatchObject({ name: "TransitionOwnerObsoleteError" });
    const uiPublication = vi.fn();
    expect(handle.publishAccepted({ surface: "ui", publish: uiPublication })).toBe("rejected");
    expect(uiPublication).not.toHaveBeenCalled();
  });
});
