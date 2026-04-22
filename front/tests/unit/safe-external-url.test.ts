import { describe, expect, it } from "vitest";
import { safeExternalHttpsUrl } from "@/shared/security/safe-external-url";

describe("safeExternalHttpsUrl", () => {
  it("allows normalized https URLs", () => {
    expect(safeExternalHttpsUrl(" https://example.com/books?id=1 ")).toBe("https://example.com/books?id=1");
  });

  it("rejects non-https and credentialed URLs", () => {
    expect(safeExternalHttpsUrl("http://example.com/books")).toBeNull();
    expect(safeExternalHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalHttpsUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeExternalHttpsUrl("//example.com/books")).toBeNull();
    expect(safeExternalHttpsUrl("/app/session/current")).toBeNull();
    expect(safeExternalHttpsUrl("https://user@example.com/books")).toBeNull();
  });
});
