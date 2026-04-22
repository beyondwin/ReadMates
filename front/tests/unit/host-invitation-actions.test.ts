import { afterEach, describe, expect, it, vi } from "vitest";
import { createInvitation, listInvitations, revokeInvitation } from "@/features/host/actions/invitations";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("host invitation actions", () => {
  it("routes list, create, and revoke through the centralized ReadMates fetch helper", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await listInvitations();
    await createInvitation({ email: "member@example.com", name: "Member" });
    await revokeInvitation("invite id/1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/bff/api/host/invitations",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/bff/api/host/invitations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "member@example.com", name: "Member" }),
        cache: "no-store",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/bff/api/host/invitations/invite%20id%2F1/revoke",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
      }),
    );

    const createHeaders = fetchMock.mock.calls[1]?.[1]?.headers;
    expect(createHeaders).toBeInstanceOf(Headers);
    expect((createHeaders as Headers).get("Content-Type")).toBe("application/json");
  });

  it("uses centralized 401 handling for invitation responses", async () => {
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { assign: assignMock });

    await expect(listInvitations()).rejects.toThrow("ReadMates session expired");

    expect(assignMock).toHaveBeenCalledWith("/login");
  });
});
