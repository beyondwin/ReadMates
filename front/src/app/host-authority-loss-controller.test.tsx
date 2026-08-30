import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation, useNavigate } from "react-router";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import {
  createHostSensitiveStorage,
  type HostSensitiveStorage,
} from "@/features/host/storage/host-sensitive-storage";
import { hostClubQueryPrefix } from "@/features/host/queries/host-state-purge";
import { signalHostAuthorityLoss } from "@/shared/api/host-authority-event";
import type { PendingHandle, ReceiptRecoveryCapsule } from "@/shared/model/global-space";
import {
  createGlobalSpaceTransitionCoordinator,
  createRetiredReceiptCapsuleRegistry,
} from "./global-space-transition";
import { HostAuthorityLossController } from "./host-authority-loss-controller";

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="location">{location.pathname}</output>
      <button type="button" onClick={() => void navigate("/clubs/other-club/app/host")}>other club</button>
    </>
  );
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function SensitiveProbe({ storage }: { storage: HostSensitiveStorage }) {
  const [secret, setSecret] = useState("private meeting passcode");
  useEffect(() => storage.register({
    clubSlug: "reading-sai",
    resourceKey: "meeting-form-draft:session-1",
    clear: () => setSecret(""),
  }), [storage]);
  return <output aria-label="sensitive-content">{secret}</output>;
}

describe("HostAuthorityLossController", () => {
  it("purges the owning club then safely replaces the active host route", async () => {
    const queryClient = client();
    const storage = createHostSensitiveStorage();
    const clearMemory = vi.fn();
    storage.register({
      clubSlug: "reading-sai",
      resourceKey: "record-draft:session-1",
      clear: clearMemory,
    });
    const same = [...hostClubQueryPrefix("reading-sai"), "sessions"];
    const other = [...hostClubQueryPrefix("other-club"), "sessions"];
    queryClient.setQueryData(same, "remove");
    queryClient.setQueryData(other, "keep");
    const onHandled = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/clubs/reading-sai/app/host/meetings/session-1/basic"]}>
          <HostAuthorityLossController storage={storage} onHandled={onHandled} />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    signalHostAuthorityLoss({
      code: "HOST_AUTHORITY_REVOKED",
      clubSlug: "reading-sai",
      requestKind: "SESSION_BASIC_SAVE",
    });

    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent(/^\/clubs\/reading-sai\/app$/));
    expect(clearMemory).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(same)).toBeUndefined();
    expect(queryClient.getQueryData(other)).toBe("keep");
    expect(onHandled).toHaveBeenCalledWith(
      "HOST_AUTHORITY_REVOKED",
      "/clubs/reading-sai/app",
      expect.stringMatching(/^host-authority-loss-/),
    );
  });

  it("commits mounted sensitive-state clearing before the safe replacement", async () => {
    const queryClient = client();
    const storage = createHostSensitiveStorage();
    const contentSeenWhenHandled: string[] = [];

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/clubs/reading-sai/app/host/meetings/session-1/basic"]}>
          <HostAuthorityLossController
            storage={storage}
            onHandled={() => {
              contentSeenWhenHandled.push(screen.getByLabelText("sensitive-content").textContent ?? "");
            }}
          />
          <SensitiveProbe storage={storage} />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    signalHostAuthorityLoss({
      code: "HOST_AUTHORITY_REVOKED",
      clubSlug: "reading-sai",
      requestKind: "SESSION_BASIC_SAVE",
    });

    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent(/^\/clubs\/reading-sai\/app$/));
    expect(contentSeenWhenHandled).toEqual([""]);
  });

  it("purges a background club without replacing the current club route", async () => {
    const queryClient = client();
    const storage = createHostSensitiveStorage();
    const onHandled = vi.fn();
    const background = [...hostClubQueryPrefix("other-club"), "notifications"];
    queryClient.setQueryData(background, "remove");

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/clubs/reading-sai/app/host"]}>
          <HostAuthorityLossController storage={storage} onHandled={onHandled} />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    signalHostAuthorityLoss({
      code: "CROSS_CLUB_SCOPE",
      clubSlug: "other-club",
      requestKind: "MEMBER_LIST",
    });

    await waitFor(() => expect(queryClient.getQueryData(background)).toBeUndefined());
    expect(screen.getByLabelText("location")).toHaveTextContent("/clubs/reading-sai/app/host");
    expect(onHandled).not.toHaveBeenCalled();
  });

  it("commits only one replacement handoff for concurrent same-club authority events", async () => {
    const queryClient = client();
    const storage = createHostSensitiveStorage();
    const onHandled = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/clubs/reading-sai/app/host"]}>
          <HostAuthorityLossController storage={storage} onHandled={onHandled} />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    act(() => {
      signalHostAuthorityLoss({
        code: "MEMBERSHIP_SUSPENDED",
        clubSlug: "reading-sai",
        requestKind: "SESSION_RECORD_DRAFT_SAVE",
      });
      signalHostAuthorityLoss({
        code: "HOST_AUTHORITY_REVOKED",
        clubSlug: "reading-sai",
        requestKind: "SESSION_RECORD_DRAFT_SAVE",
      });
    });

    await waitFor(() => expect(screen.getByLabelText("location"))
      .toHaveTextContent("/clubs/reading-sai/app"));
    await act(() => new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    }));
    expect(onHandled).toHaveBeenCalledTimes(1);
  });

  it("does not replace a different club entered while the purge is still running", async () => {
    const queryClient = client();
    let finishClear!: () => void;
    const clearClub = vi.fn(() => new Promise<void>((resolve) => {
      finishClear = resolve;
    }));
    const onHandled = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/clubs/reading-sai/app/host"]}>
          <HostAuthorityLossController
            storage={{ register: vi.fn(() => vi.fn()), clearClub }}
            onHandled={onHandled}
          />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    signalHostAuthorityLoss({
      code: "HOST_AUTHORITY_REVOKED",
      clubSlug: "reading-sai",
      requestKind: "SESSION_BASIC_SAVE",
    });
    await waitFor(() => expect(clearClub).toHaveBeenCalledWith("reading-sai"));

    await userEvent.click(screen.getByRole("button", { name: "other club" }));
    await waitFor(() => expect(screen.getByLabelText("location"))
      .toHaveTextContent("/clubs/other-club/app/host"));
    finishClear();

    await waitFor(() => expect(screen.getByLabelText("location"))
      .toHaveTextContent("/clubs/other-club/app/host"));
    expect(onHandled).not.toHaveBeenCalled();
  });

  it("pre-purges active and retired transition authority before the emitted event awaits host-state purge", async () => {
    const queryClient = client();
    const registry = createRetiredReceiptCapsuleRegistry();
    const cachePublication = vi.fn();
    const coordinator = createGlobalSpaceTransitionCoordinator({
      registry,
      publication: { currentOwnerRefetch: cachePublication },
    });
    let releaseDraftPurge!: () => void;
    const clearClub = vi.fn(() => new Promise<void>((resolve) => {
      releaseDraftPurge = resolve;
    }));
    const request = {
      previewId: "preview-1" as string | null,
      reasonCategory: "SECURITY_INCIDENT" as string | null,
      reason: "bounded reason" as string | null,
      idempotencyKey: "intent-1" as string | null,
    };
    const originalRequestCount = 1;
    let replayCount = 0;
    const capsule: ReceiptRecoveryCapsule = {
      operationId: "operation-1",
      reconcileOriginal: vi.fn(async () => {
        replayCount += 1;
        return { operationId: "operation-1", outcome: "succeeded" as const };
      }),
      invalidateForAuthorityLoss: vi.fn(),
      clear: vi.fn(() => {
        request.previewId = null;
        request.reasonCategory = null;
        request.reason = null;
        request.idempotencyKey = null;
      }),
    };
    const handle = coordinator.beginPending({
      ownerId: "takedown",
      operationId: "operation-1",
      recovery: { kind: "receipt", capsule },
    });
    handle.unregister();
    expect(registry.size()).toBe(1);
    const ui = vi.fn();
    const receiptCallback = vi.fn();
    const successCopy = vi.fn();
    const errorCopy = vi.fn();
    const navigation = vi.fn();
    const returnTarget = vi.fn();
    const sessionStoragePublication = vi.fn();
    const onHandled = vi.fn();
    queryClient.setQueryData([...hostClubQueryPrefix("reading-sai"), "private"], "private");

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/clubs/reading-sai/app/host"]}>
          <HostAuthorityLossController
            storage={{ register: vi.fn(() => vi.fn()), clearClub }}
            onBeforePurge={() => coordinator.invalidateForAuthorityLoss()}
            onHandled={onHandled}
          />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    act(() => signalHostAuthorityLoss({
      code: "HOST_AUTHORITY_REVOKED",
      clubSlug: "reading-sai",
      requestKind: "PUBLIC_TAKEDOWN_CONFIRM",
    }));

    await waitFor(() => expect(clearClub).toHaveBeenCalledWith("reading-sai"));
    expect(capsule.invalidateForAuthorityLoss).toHaveBeenCalledTimes(1);
    expect(capsule.clear).toHaveBeenCalledTimes(1);
    expect(request).toEqual({
      previewId: null,
      reasonCategory: null,
      reason: null,
      idempotencyKey: null,
    });
    expect(registry.size()).toBe(0);
    expect(onHandled).not.toHaveBeenCalled();
    expect(screen.getByLabelText("location")).toHaveTextContent("/clubs/reading-sai/app/host");
    expect(queryClient.getQueryData([...hostClubQueryPrefix("reading-sai"), "private"])).toBe("private");

    const settlement = await handle.settle("succeeded");
    const publicationResults = [
      handle.publishAccepted({ surface: "ui", publish: ui }),
      handle.publishAccepted({ surface: "cache", publish: cachePublication }),
      handle.publishAccepted({ surface: "receiptCallback", publish: receiptCallback }),
      handle.publishAccepted({ surface: "successCopy", publish: successCopy }),
      handle.publishAccepted({ surface: "errorCopy", publish: errorCopy }),
      handle.publishAccepted({ surface: "navigation", publish: navigation }),
      handle.publishAccepted({ surface: "returnTarget", publish: returnTarget }),
      handle.publishAccepted({ surface: "sessionStorage", publish: sessionStoragePublication }),
    ] satisfies ReturnType<PendingHandle["publishAccepted"]>[];
    const observation = await handle.reconcile();

    expect(settlement).toBe("obsolete");
    expect(observation).toEqual({ operationId: "operation-1", outcome: "authority-lost" });
    expect(originalRequestCount).toBe(1);
    expect(replayCount).toBe(0);
    expect(publicationResults).toEqual(Array(8).fill("rejected"));
    expect(cachePublication).not.toHaveBeenCalled();
    expect(ui).not.toHaveBeenCalled();
    expect(receiptCallback).not.toHaveBeenCalled();
    expect(successCopy).not.toHaveBeenCalled();
    expect(errorCopy).not.toHaveBeenCalled();
    expect(navigation).not.toHaveBeenCalled();
    expect(returnTarget).not.toHaveBeenCalled();
    expect(sessionStoragePublication).not.toHaveBeenCalled();

    act(() => releaseDraftPurge());
    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent(/^\/clubs\/reading-sai\/app$/));
    expect(queryClient.getQueryData([...hostClubQueryPrefix("reading-sai"), "private"])).toBeUndefined();
    expect(onHandled).toHaveBeenCalledTimes(1);
  });
});
