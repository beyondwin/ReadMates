import { existsSync, mkdtempSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPROVED_MOCKUPS,
  approvedMockupIdsAffectedBy,
  approvedMockupsAffectedBy,
  approvedReferenceRepositoryPath,
  unmappedVisualSensitivePaths,
} from "../e2e/support/approved-mockup-manifest";
import {
  APPROVED_COMPARISON_REPORT_REQUIRED_FIELDS,
  CANONICAL_RENDERER_IMAGE,
  areNodesInSemanticDocumentOrder,
  assertApprovedMismatchRatio,
  assertApprovedRouteReport,
  expectGeometryWithinTolerance,
  resolveApprovedRendererImage,
  verifyApprovedReference,
  writeApprovedArtifacts,
  type ApprovedComparisonReport,
} from "../e2e/support/approved-mockup-contract";
import { parseVisualAuthoritySelection } from "../e2e/support/approved-route-scenarios";

function validReport(overrides: Partial<ApprovedComparisonReport> = {}): ApprovedComparisonReport {
  return {
    schemaVersion: 1,
    id: "admin-today-desktop",
    referenceSha256: "abc",
    candidateSha256: "def",
    normalizedSize: { width: 1672, height: 941 },
    mismatchPixelRatio: 0.01,
    mismatchPassed: true,
    regions: [],
    renderer: {
      image: "mcr.microsoft.com/playwright:v1.61.1-jammy",
      browser: "chromium",
      playwrightVersion: "1.61.1",
      nodeVersion: "24.0.0",
      pnpmVersion: "11.13.1",
      dpr: 1,
      pretendardFaces: ["Pretendard Variable"],
    },
    viewport: { width: 1672, height: 941 },
    geometry: [],
    typography: [],
    firstViewport: [],
    defaultVisibleCount: null,
    overflow: { horizontalCssPx: 0, passed: true },
    interactions: [],
    structure: [],
    requestAudit: { unmatched: 0, effecting: 0, preview: 0, passed: true },
    mask: null,
    verdict: "pass",
    ...overrides,
  };
}

describe("approved mockup contract", () => {
  it("registers the exact 7 Admin and 11 Host authorities with unique ids", () => {
    expect(APPROVED_MOCKUPS.filter((entry) => entry.role === "admin")).toHaveLength(7);
    expect(APPROVED_MOCKUPS.filter((entry) => entry.role === "host")).toHaveLength(11);
    expect(new Set(APPROVED_MOCKUPS.map((entry) => entry.id)).size).toBe(18);
    for (const entry of APPROVED_MOCKUPS) verifyApprovedReference(entry);
  });

  it("treats a repeated node as document-ordered and still rejects reversed distinct nodes", () => {
    const following = 4;
    const first = {
      compareDocumentPosition(other: { id: string }) {
        return other === second ? following : 0;
      },
    };
    const second = {
      compareDocumentPosition() {
        return 0;
      },
    };
    expect(areNodesInSemanticDocumentOrder([first as Node, first as Node])).toBe(true);
    expect(areNodesInSemanticDocumentOrder([first as Node, second as Node])).toBe(true);
    expect(areNodesInSemanticDocumentOrder([second as Node, first as Node])).toBe(false);
  });

  it("fails closed above the 4 CSS px major-region tolerance", () => {
    expect(() => expectGeometryWithinTolerance(
      { x: 0, y: 0, width: 100, height: 80 },
      { x: 0, y: 0, width: 104.01, height: 80 },
      4,
    )).toThrow(/width delta 4.01px/);
  });

  it.each([
    ["admin-today-desktop", 0.020001],
    ["host-prep-desktop", 0.08],
    ["host-live-mobile", 0.15],
  ])("rejects %s above the exact 0.02 ceiling", (id, mismatchPixelRatio) => {
    expect(() => assertApprovedMismatchRatio({
      id,
      mismatchPixelRatio,
      maxDiffPixelRatio: 0.02,
    })).toThrow(new RegExp(`${id} mismatch ratio .* exceeds 0.02`));
  });

  it("does not expose broad ratio bypass fields in the contract source", () => {
    const contractSource = readFileSync(
      new URL("../e2e/support/approved-mockup-contract.ts", import.meta.url),
      "utf8",
    );
    expect(contractSource).not.toMatch(/allowFontRasterException|fontRasterExceptionMaxRatio|skipMismatchRatioAssertion/);
  });

  it("maps shared visual dependencies to every downstream authority", () => {
    expect(approvedMockupsAffectedBy(["front/shared/ui/app-club-shell.tsx"])
      .filter((entry) => entry.role === "host")).toHaveLength(11);
    expect(approvedMockupsAffectedBy(["front/features/platform-admin/ui/admin-shell.css"]))
      .toHaveLength(7);
  });

  it("maps host settings and invites route files to host-settings-desktop", () => {
    for (const path of [
      "front/features/host/route/host-settings-route.tsx",
      "front/features/host/route/host-invitations-route.tsx",
    ]) {
      expect(approvedMockupsAffectedBy([path]).map((entry) => entry.id))
        .toEqual(["host-settings-desktop"]);
    }
  });

  it("maps design-system token changes to every approved authority", () => {
    expect(approvedMockupsAffectedBy(["design/system/src/styles/tokens.css"]))
      .toHaveLength(18);
  });

  it("keeps test:ct:docker and removes ct:approved package scripts", () => {
    const packageJson = JSON.parse(readFileSync(
      new URL("../../package.json", import.meta.url),
      "utf8",
    )) as { scripts: Record<string, string> };
    expect(packageJson.scripts["test:ct:docker"]).toBeTruthy();
    expect(Object.keys(packageJson.scripts).some((name) => name.includes("ct:approved"))).toBe(false);
  });

  it.each(APPROVED_COMPARISON_REPORT_REQUIRED_FIELDS)(
    "fails closed when report field %s is missing",
    (field) => {
      const report = validReport() as Record<string, unknown>;
      delete report[field];
      expect(() => assertApprovedRouteReport(report as unknown as ApprovedComparisonReport)).toThrow(field);
    },
  );

  it("writes five diagnostic artifacts before a failed report assertion", () => {
    const directory = mkdtempSync(join(tmpdir(), "approved-report-"));
    const testInfo = {
      outputPath: (...segments: string[]) => join(directory, ...segments),
    };
    const report = validReport({
      mismatchPixelRatio: 0.5,
      mismatchPassed: false,
      verdict: "fail",
    });
    writeApprovedArtifacts(
      testInfo,
      report.id,
      Buffer.from("reference"),
      {
        candidate: "data:image/png;base64,Y2FuZGlkYXRl",
        overlay: "data:image/png;base64,b3ZlcmxheQ==",
        diff: "data:image/png;base64,ZGlmZg==",
      },
      report,
    );
    for (const suffix of ["reference.png", "candidate.png", "overlay.png", "diff.png", "report.json"]) {
      expect(existsSync(testInfo.outputPath("approved-mockup", `${report.id}-${suffix}`))).toBe(true);
    }
    expect(() => assertApprovedRouteReport(report)).toThrow(/mismatch ratio/);
    expect(existsSync(testInfo.outputPath("approved-mockup", `${report.id}-report.json`))).toBe(true);
  });

  it("names failed sub-results instead of hiding them behind the verdict", () => {
    expect(() => assertApprovedRouteReport(validReport({
      verdict: "fail",
      geometry: [{
        name: "admin-header",
        actual: { x: 10, y: 0, width: 1672, height: 86 },
        expected: { x: 0, y: 0, width: 1672, height: 86 },
        toleranceCssPx: 4,
        deltas: { x: 10, y: 0, width: 0, height: 0 },
        passed: false,
      }],
    }))).toThrow(/geometry:admin-header/);
    expect(() => assertApprovedRouteReport(validReport({
      verdict: "fail",
      structure: [{
        name: "nav-icons",
        selector: ".admin-layout-nav__item [data-icon]",
        presence: "present",
        passed: false,
        detail: "count=0 min=4",
      }],
    }))).toThrow(/structure:nav-icons/);
  });

  it("rejects a local renderer fingerprint that is not the pinned Jammy image", () => {
    const previous = process.env.READMATES_VISUAL_AUTHORITY_RENDERER_IMAGE;
    delete process.env.READMATES_VISUAL_AUTHORITY_RENDERER_IMAGE;
    try {
      expect(resolveApprovedRendererImage()).not.toBe(CANONICAL_RENDERER_IMAGE);
      expect(() => assertApprovedRouteReport(validReport({
        renderer: {
          image: `local/${process.platform}`,
          browser: "chromium",
          playwrightVersion: "1.61.1",
          nodeVersion: "24.0.0",
          pnpmVersion: "11.13.1",
          dpr: 1,
          pretendardFaces: ["Pretendard Variable"],
        },
      }))).toThrow(/jammy/i);
    } finally {
      if (previous === undefined) {
        delete process.env.READMATES_VISUAL_AUTHORITY_RENDERER_IMAGE;
      } else {
        process.env.READMATES_VISUAL_AUTHORITY_RENDERER_IMAGE = previous;
      }
    }
  });
});

describe("visual authority invalidation", () => {
  it.each([
    ["package.json", 18],
    ["front/package.json", 18],
    ["pnpm-lock.yaml", 18],
    ["front/playwright.config.ts", 18],
    [".github/workflows/ci.yml", 18],
    ["front/src/styles/globals.css", 18],
    ["design/system/src/styles/tokens.css", 18],
    ["front/tests/e2e/support/approved-mockup-manifest.ts", 18],
    ["front/tests/e2e/support/approved-mockup-contract.ts", 18],
    ["front/tests/e2e/support/approved-route-scenarios.ts", 18],
    ["front/tests/e2e/support/approved-route-harness.ts", 18],
    ["front/tests/e2e/support/approved-route-structure.ts", 18],
    ["front/tests/e2e/support/approved-route-structure.test.ts", 18],
    ["front/tests/e2e/support/approved-route-request-audit.ts", 18],
    ["front/tests/performance/visual-authority-docker.ts", 18],
    ["front/scripts/run-visual-authority-docker.ts", 18],
    ["front/scripts/list-affected-visual-authorities.ts", 18],
    ["front/features/platform-admin/ui/admin-shell.css", 7],
    ["front/features/platform-admin/route/admin-shell-layout.tsx", 7],
    ["front/src/app/routes/admin.tsx", 7],
    ["front/tests/e2e/admin-approved-routes.spec.ts", 7],
    ["front/tests/e2e/support/admin-approved-route-fixtures.ts", 7],
    ["front/features/platform-admin/ui/admin-today.css", 3],
    ["front/features/host/ui/shell/host-shell.css", 11],
    ["front/src/app/routes/host.tsx", 11],
    ["front/tests/e2e/host-approved-routes.spec.ts", 11],
    ["front/tests/e2e/support/host-approved-route-fixtures.ts", 11],
    ["front/features/host/ui/person/host-person-detail.css", 1],
    ["front/shared/ui/app-club-shell.tsx", 11],
    ["front/shared/ui/global-space-switcher.tsx", 1],
    ["front/shared/ui/top-nav.tsx", 18],
    ["front/tests/e2e/approved-route-auth-scope.spec.ts", 7],
    ["front/tests/e2e/approved-route-stress.spec.ts", 18],
  ] as const)("maps %s to %s authorities", (path, count) => {
    const ids = approvedMockupIdsAffectedBy([path]);
    expect(ids.length, path).toBe(count);
    expect(unmappedVisualSensitivePaths([path])).toEqual([]);
  });

  it("maps each approved reference PNG to only its own id", () => {
    for (const entry of APPROVED_MOCKUPS) {
      expect(approvedMockupIdsAffectedBy([approvedReferenceRepositoryPath(entry)]))
        .toEqual([entry.id]);
    }
  });

  it("returns an empty set for unrelated server paths", () => {
    expect(approvedMockupIdsAffectedBy(["server/src/main/kotlin/Example.kt"])).toEqual([]);
    expect(unmappedVisualSensitivePaths(["server/src/main/kotlin/Example.kt"])).toEqual([]);
  });

  it("uses the role partition when a visual-sensitive host or admin file is not listed exactly", () => {
    expect(approvedMockupIdsAffectedBy(["front/features/platform-admin/ui/unknown-visual.css"]))
      .toHaveLength(7);
    expect(unmappedVisualSensitivePaths(["front/features/platform-admin/ui/unknown-visual.css"]))
      .toEqual([]);
  });

  it("treats a non-empty selection as at least one test and rejects malformed filters", () => {
    const selected = parseVisualAuthoritySelection("admin-today-desktop,host-prep-mobile");
    expect(selected.size).toBeGreaterThan(0);
    expect(parseVisualAuthoritySelection("").size).toBe(0);
    expect(parseVisualAuthoritySelection(" \n ")).toEqual(new Set());
    expect([...parseVisualAuthoritySelection(" host-prep-mobile ")]).toEqual(["host-prep-mobile"]);
    expect(() => parseVisualAuthoritySelection("admin-today-desktop, host-prep-mobile")).toThrow(/blank/i);
    expect(() => parseVisualAuthoritySelection("not-an-id")).toThrow(/Unknown visual authority id/);
    expect(() => parseVisualAuthoritySelection("admin-today-desktop,admin-today-desktop")).toThrow(/duplicate/i);
  });
});
