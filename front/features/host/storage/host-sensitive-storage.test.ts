import { describe, expect, it, vi } from "vitest";
import {
  HOST_SENSITIVE_RESOURCE_KINDS,
  createHostSensitiveStorage,
} from "./host-sensitive-storage";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("host sensitive storage", () => {
  it("owns every host-sensitive client resource class", () => {
    expect(HOST_SENSITIVE_RESOURCE_KINDS).toEqual([
      "meeting-form-draft",
      "record-draft",
      "ai-draft",
      "mutation-receipt",
      "reconciliation",
      "history",
      "notification-preview",
      "host-return-state",
    ]);
  });

  it("clears registered memory and persisted state only for the exact club", async () => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    const storage = createHostSensitiveStorage({
      localStorage,
      sessionStorage,
    });
    const sameClubClear = vi.fn();
    const otherClubClear = vi.fn();
    storage.register({
      clubSlug: "reading-sai",
      resourceKey: "meeting-form-draft:new",
      clear: sameClubClear,
    });
    storage.register({
      clubSlug: "other-club",
      resourceKey: "notification-preview:1",
      clear: otherClubClear,
    });
    localStorage.setItem("readmates:host:reading-sai:ai-draft:session-1", "sensitive");
    sessionStorage.setItem("readmates:host:reading-sai:host-return-state", "/secret");
    localStorage.setItem("readmates:host:other-club:ai-draft:session-2", "keep");

    await storage.clearClub("reading-sai");

    expect(sameClubClear).toHaveBeenCalledTimes(1);
    expect(otherClubClear).not.toHaveBeenCalled();
    expect(localStorage.getItem("readmates:host:reading-sai:ai-draft:session-1")).toBeNull();
    expect(sessionStorage.getItem("readmates:host:reading-sai:host-return-state")).toBeNull();
    expect(localStorage.getItem("readmates:host:other-club:ai-draft:session-2")).toBe("keep");
  });

  it("unregisters mounted state without clearing it", async () => {
    const storage = createHostSensitiveStorage();
    const clear = vi.fn();
    const unregister = storage.register({
      clubSlug: "reading-sai",
      resourceKey: "record-draft:session-1",
      clear,
    });

    unregister();
    await storage.clearClub("reading-sai");

    expect(clear).not.toHaveBeenCalled();
  });

  it("removes an exact-club host return target without touching another club", async () => {
    const sessionStorage = new MemoryStorage();
    const storage = createHostSensitiveStorage({ sessionStorage });
    sessionStorage.setItem(
      "readmates:last-safe-workspace-target:host",
      "/clubs/reading-sai/app/host/sessions/session-1",
    );

    await storage.clearClub("reading-sai");

    expect(sessionStorage.getItem("readmates:last-safe-workspace-target:host")).toBeNull();

    sessionStorage.setItem(
      "readmates:last-safe-workspace-target:host",
      "/clubs/other-club/app/host/sessions/session-2",
    );
    await storage.clearClub("reading-sai");

    expect(sessionStorage.getItem("readmates:last-safe-workspace-target:host"))
      .toBe("/clubs/other-club/app/host/sessions/session-2");
  });

  it("removes exact-club committed host route receipts", async () => {
    const sessionStorage = new MemoryStorage();
    const storage = createHostSensitiveStorage({ sessionStorage });
    sessionStorage.setItem("readmates:committed-workspace-route", JSON.stringify({
      version: 1,
      workspace: "host",
      clubScope: "reading-sai",
      href: "/clubs/reading-sai/app/host/sessions/session-1",
    }));

    await storage.clearClub("reading-sai");

    expect(sessionStorage.getItem("readmates:committed-workspace-route")).toBeNull();
  });
});
