import { describe, expect, it } from "vitest";
import { APPROVED_MOCKUPS, approvedMockupsAffectedBy } from "../e2e/support/approved-mockup-manifest";
import {
  FONT_RASTER_EXCEPTION_MAX_RATIO,
  HOST_MOBILE_FONT_RASTER_EXCEPTION_MAX_RATIO,
  assertApprovedMismatchRatio,
  expectGeometryWithinTolerance,
  verifyApprovedReference,
} from "../e2e/support/approved-mockup-contract";

describe("approved mockup contract", () => {
  it("registers the exact 7 Admin and 11 Host authorities with unique ids", () => {
    expect(APPROVED_MOCKUPS.filter((entry) => entry.role === "admin")).toHaveLength(7);
    expect(APPROVED_MOCKUPS.filter((entry) => entry.role === "host")).toHaveLength(11);
    expect(new Set(APPROVED_MOCKUPS.map((entry) => entry.id)).size).toBe(18);
    for (const entry of APPROVED_MOCKUPS) verifyApprovedReference(entry);
  });

  it("fails closed above the 4 CSS px major-region tolerance", () => {
    expect(() => expectGeometryWithinTolerance(
      { x: 0, y: 0, width: 100, height: 80 },
      { x: 0, y: 0, width: 104.01, height: 80 },
      4,
    )).toThrow(/width delta 4.01px/);
  });

  it("fails closed above maxDiffPixelRatio without a font-raster exception", () => {
    expect(() => assertApprovedMismatchRatio({
      id: "admin-today-desktop",
      mismatchPixelRatio: 0.0201,
      maxDiffPixelRatio: 0.02,
    })).toThrow(/admin-today-desktop mismatch ratio 0.0201 exceeds 0.02/);
  });

  it("accepts a documented font-raster exception at or below 0.10", () => {
    expect(() => assertApprovedMismatchRatio({
      id: "admin-today-desktop",
      mismatchPixelRatio: 0.057,
      maxDiffPixelRatio: 0.02,
      allowFontRasterException: true,
    })).not.toThrow();
  });

  it("still fails a font-raster exception above 0.10 as structural", () => {
    expect(FONT_RASTER_EXCEPTION_MAX_RATIO).toBe(0.10);
    expect(() => assertApprovedMismatchRatio({
      id: "admin-today-desktop",
      mismatchPixelRatio: 0.1001,
      maxDiffPixelRatio: 0.02,
      allowFontRasterException: true,
    })).toThrow(/admin-today-desktop mismatch ratio 0.1001 exceeds 0.1/);
    expect(() => assertApprovedMismatchRatio({
      id: "host-prep-desktop",
      mismatchPixelRatio: 0.1001,
      maxDiffPixelRatio: 0.02,
      allowFontRasterException: true,
    })).toThrow(/host-prep-desktop mismatch ratio 0.1001 exceeds 0.1/);
  });

  it("accepts a host-mobile font-raster exception at or below 0.15 after copy match", () => {
    expect(HOST_MOBILE_FONT_RASTER_EXCEPTION_MAX_RATIO).toBe(0.15);
    expect(() => assertApprovedMismatchRatio({
      id: "host-prep-mobile",
      mismatchPixelRatio: 0.103,
      maxDiffPixelRatio: 0.02,
      allowFontRasterException: true,
      fontRasterExceptionMaxRatio: HOST_MOBILE_FONT_RASTER_EXCEPTION_MAX_RATIO,
    })).not.toThrow();
    expect(() => assertApprovedMismatchRatio({
      id: "host-live-mobile",
      mismatchPixelRatio: 0.132,
      maxDiffPixelRatio: 0.02,
      allowFontRasterException: true,
      fontRasterExceptionMaxRatio: HOST_MOBILE_FONT_RASTER_EXCEPTION_MAX_RATIO,
    })).not.toThrow();
  });

  it("still fails a host-mobile font-raster exception above 0.15", () => {
    expect(() => assertApprovedMismatchRatio({
      id: "host-live-mobile",
      mismatchPixelRatio: 0.1501,
      maxDiffPixelRatio: 0.02,
      allowFontRasterException: true,
      fontRasterExceptionMaxRatio: HOST_MOBILE_FONT_RASTER_EXCEPTION_MAX_RATIO,
    })).toThrow(/host-live-mobile mismatch ratio 0.1501 exceeds 0.15/);
  });

  it("maps shared visual dependencies to every downstream authority", () => {
    expect(approvedMockupsAffectedBy(["shared/ui/app-club-shell.tsx"])
      .filter((entry) => entry.role === "host")).toHaveLength(11);
    expect(approvedMockupsAffectedBy(["features/platform-admin/ui/admin-shell.css"]))
      .toHaveLength(7);
  });

  it("maps host settings and invites route files to host-settings-desktop", () => {
    for (const path of [
      "features/host/route/host-settings-route.tsx",
      "features/host/route/host-invitations-route.tsx",
    ]) {
      expect(approvedMockupsAffectedBy([path]).map((entry) => entry.id))
        .toEqual(["host-settings-desktop"]);
    }
  });

  it("maps design-system token changes to every approved authority", () => {
    expect(approvedMockupsAffectedBy(["design/system/src/styles/tokens.css"]))
      .toHaveLength(18);
  });

  it("does not throw above 0.02 when skipMismatchRatioAssertion is true", () => {
    expect(() => assertApprovedMismatchRatio({
      id: "host-prep-desktop",
      mismatchPixelRatio: 0.08,
      maxDiffPixelRatio: 0.02,
      skipMismatchRatioAssertion: true,
    })).not.toThrow();
  });

  it("still throws above 0.02 when skipMismatchRatioAssertion is omitted", () => {
    expect(() => assertApprovedMismatchRatio({
      id: "host-prep-desktop",
      mismatchPixelRatio: 0.08,
      maxDiffPixelRatio: 0.02,
    })).toThrow(/host-prep-desktop mismatch ratio 0.08 exceeds 0.02/);
  });
});
