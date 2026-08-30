import { describe, expect, it } from "vitest";
import {
  representativeSpaceReturnTarget,
  sameSpaceIdentity,
  spaceIdentityKey,
  type SpaceIdentity,
} from "./global-space";

describe("global space model", () => {
  it.each([
    [{ productSpace: "platform" }, "platform"],
    [
      { productSpace: "clubs", clubId: "club-1", clubSlug: "reading-sai", perspective: "member" },
      "clubs:club-1:reading-sai:member",
    ],
    [
      { productSpace: "clubs", clubId: "club-1", clubSlug: "reading-sai", perspective: "host" },
      "clubs:club-1:reading-sai:host",
    ],
  ] as const)("keys an identity without collapsing its club or perspective", (identity, expected) => {
    expect(spaceIdentityKey(identity)).toBe(expected);
  });

  it("compares every identity axis", () => {
    const member: SpaceIdentity = {
      productSpace: "clubs",
      clubId: "club-1",
      clubSlug: "reading-sai",
      perspective: "member",
    };

    expect(sameSpaceIdentity(member, { ...member })).toBe(true);
    expect(sameSpaceIdentity(member, { ...member, clubId: "club-2" })).toBe(false);
    expect(sameSpaceIdentity(member, { ...member, clubSlug: "other-club" })).toBe(false);
    expect(sameSpaceIdentity(member, { ...member, perspective: "host" })).toBe(false);
    expect(sameSpaceIdentity(member, { productSpace: "platform" })).toBe(false);
  });

  it.each([
    [{ productSpace: "platform" }, "/admin/today"],
    [
      { productSpace: "clubs", clubId: "club-1", clubSlug: "reading-sai", perspective: "member" },
      "/clubs/reading-sai/app",
    ],
    [
      { productSpace: "clubs", clubId: "club-1", clubSlug: "reading-sai", perspective: "host" },
      "/clubs/reading-sai/app/host",
    ],
  ] as const)("provides a route-only safe representative target", (identity, pathname) => {
    expect(representativeSpaceReturnTarget(identity)).toEqual({
      pathname,
      search: "",
      hash: "",
      focusId: null,
      scrollTop: 0,
    });
  });
});
