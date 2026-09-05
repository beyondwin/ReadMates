import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPROVED_MOCKUPS,
  approvedMockupIdsAffectedBy,
  approvedReferenceRepositoryPath,
} from "../e2e/support/approved-mockup-manifest";
import { parsePnpmPackageManager } from "./ct-docker";
import {
  assertPlaywrightRunExecutedMatchingTests,
  buildVisualAuthorityDockerCommand,
  resolveAffectedVisualAuthorities,
  runListAffectedVisualAuthorities,
} from "./visual-authority-docker";

const frontPackageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { scripts?: Record<string, string> };

const TASK_PATH_TABLE = [
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
  ["front/tests/e2e/support/approved-route-geometry.ts", 18],
  ["front/tests/e2e/support/approved-route-scenarios.test.ts", 18],
  ["front/tests/e2e/support/approved-route-request-audit.test.ts", 18],
  ["front/tests/unit/approved-mockup-contract.test.ts", 18],
  ["front/tests/performance/visual-authority-docker.ts", 18],
  ["front/tests/performance/visual-authority-docker.test.ts", 18],
  ["front/scripts/run-visual-authority-docker.ts", 18],
  ["front/scripts/list-affected-visual-authorities.ts", 18],
  ["front/tests/e2e/approved-route-stress.spec.ts", 18],
  ["front/features/platform-admin/route/admin-shell-layout.ct.tsx", 1],
  ["front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx", 3],
  ["front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx", 5],
  ["front/features/host/ui/approved-host-ledgers.ct.tsx", 11],
  ["front/tests/e2e/support/admin-approved-route-fixtures.ts", 7],
  ["front/tests/e2e/support/admin-approved-route-fixtures.test.ts", 7],
  ["front/tests/e2e/admin-approved-routes.spec.ts", 7],
  ["front/features/platform-admin/ui/admin-today.css", 3],
  ["front/features/platform-admin/model/platform-admin-operations-model.ts", 3],
  ["front/features/platform-admin/model/platform-admin-operations-model.test.ts", 7],
  ["front/features/platform-admin/route/use-admin-today-controller.ts", 3],
  ["front/features/platform-admin/route/use-admin-today-controller.test.tsx", 7],
  ["front/features/platform-admin/ui/admin-operations-queue.tsx", 3],
  ["front/features/platform-admin/ui/admin-operations-queue.test.tsx", 7],
  ["front/features/platform-admin/ui/admin-operation-mobile-detail.tsx", 3],
  ["front/features/platform-admin/ui/admin-operation-mobile-detail.test.tsx", 7],
  ["front/features/platform-admin/ui/admin-today-ledger.tsx", 3],
  ["front/features/platform-admin/ui/admin-today-ledger.test.tsx", 7],
  ["front/features/platform-admin/route/admin-today-route.tsx", 3],
  ["front/features/platform-admin/ui/admin-editorial-ledger.css", 7],
  ["front/features/platform-admin/route/admin-shell-layout.tsx", 7],
  ["front/features/platform-admin/route/admin-shell-layout.test.tsx", 7],
  ["front/features/platform-admin/ui/admin-shell.css", 7],
  ["front/src/app/routes/admin.tsx", 7],
  ["front/tests/e2e/approved-route-auth-scope.spec.ts", 7],
  ["front/shared/ui/global-space-switcher.tsx", 1],
  ["front/shared/ui/global-space-switcher.test.tsx", 18],
  ["front/features/platform-admin/ui/admin-club-management.css", 1],
  ["front/features/platform-admin/ui/admin-service-status.css", 1],
  ["front/features/platform-admin/ui/admin-processing-records.css", 1],
  ["front/features/platform-admin/ui/admin-clubs-ledger.tsx", 1],
  ["front/features/platform-admin/ui/admin-clubs-ledger.test.tsx", 7],
  ["front/features/platform-admin/ui/admin-health-grid.tsx", 1],
  ["front/features/platform-admin/ui/admin-health-grid.test.tsx", 7],
  ["front/features/platform-admin/ui/admin-audit-ledger.tsx", 1],
  ["front/features/platform-admin/ui/admin-audit-ledger.test.tsx", 7],
  ["front/tests/e2e/support/host-approved-route-fixtures.ts", 11],
  ["front/tests/e2e/support/host-approved-route-fixtures.test.ts", 11],
  ["front/features/host/model/host-workbox-model.ts", 5],
  ["front/features/host/model/host-workbox-model.test.ts", 11],
  ["front/features/host/route/host-dashboard-route.tsx", 5],
  ["front/features/host/route/host-dashboard-route.test.tsx", 11],
  ["front/features/host/ui/workbox/host-workbox.tsx", 5],
  ["front/features/host/ui/workbox/host-workbox.test.tsx", 11],
  ["front/features/host/ui/workbox/host-workbox.ct.tsx", 11],
  ["front/features/host/ui/workbox/host-work-item.tsx", 5],
  ["front/features/host/ui/workbox/host-workbox.css", 5],
  ["front/tests/e2e/host-approved-routes.spec.ts", 11],
  ["front/features/host/ui/operating-room/host-operating-room-page.tsx", 5],
  ["front/features/host/ui/operating-room/operating-room.css", 5],
  ["front/features/host/ui/operating-room/current-meeting-header.test.tsx", 11],
  ["front/features/host/ui/operating-room/host-next-action.test.tsx", 11],
  ["front/features/host/ui/operating-room/meeting-phase-tabs.test.tsx", 11],
  ["front/features/host/ui/operating-room/preparation-ledger.test.tsx", 11],
  ["front/features/host/ui/operating-room/phase-status-ledger.test.tsx", 11],
  ["front/features/host/ui/shell/host-shell.css", 11],
  ["front/src/app/routes/host.tsx", 11],
  ["front/features/host/ui/host-editorial-ledger.css", 11],
  ["front/features/host/ui/meeting-list/host-meeting-list.tsx", 1],
  ["front/features/host/ui/meeting-list/host-meeting-list.test.tsx", 11],
  ["front/features/host/ui/meeting-list/meeting-toc.css", 1],
  ["front/features/host/ui/members/host-people-page.tsx", 11],
  ["front/features/host/ui/members/host-people-page.test.tsx", 11],
  ["front/features/host/ui/members/member-list.tsx", 2],
  ["front/features/host/ui/members/member-list.test.tsx", 11],
  ["front/features/host/ui/members/member-ledger.css", 2],
  ["front/features/host/ui/host-session-ledger.tsx", 1],
  ["front/features/host/ui/host-session-ledger.css", 1],
  ["front/features/host/ui/host-session-ledger.test.tsx", 11],
  ["front/features/host/ui/settings/host-settings-page.tsx", 1],
  ["front/features/host/ui/settings/host-invitation-links.tsx", 1],
  ["front/features/host/ui/settings/host-club-settings.tsx", 1],
  ["front/features/host/ui/settings/host-settings.css", 1],
  ["front/features/host/ui/settings/host-settings-components.test.tsx", 11],
  ["front/features/host/ui/schedule-review/host-schedule-review-page.tsx", 1],
  ["front/features/host/ui/schedule-review/host-schedule-review-page.test.tsx", 11],
  ["front/features/host/ui/schedule-review/host-schedule-review-header.tsx", 1],
  ["front/features/host/ui/schedule-review/host-schedule-review.css", 1],
  ["front/features/host/ui/person/host-person-detail.tsx", 1],
  ["front/features/host/ui/person/host-person-detail.test.tsx", 11],
  ["front/features/host/ui/person/host-person-detail.css", 1],
  ["front/shared/ui/app-club-shell.tsx", 11],
  ["front/shared/ui/top-nav.tsx", 18],
  ["server/src/main/kotlin/Example.kt", 0],
  ["docs/development/architecture.md", 0],
  ["README.md", 0],
] as const;

describe("visual authority docker command", () => {
  it("runs actual routes in the pinned Playwright image", () => {
    const command = buildVisualAuthorityDockerCommand({
      packageManager: parsePnpmPackageManager("pnpm@11.13.1"),
      workspaceHostPath: "/repo",
      authorityIds: ["admin-today-mobile", "host-prep-mobile"],
    });
    expect(command.args).toContain("mcr.microsoft.com/playwright:v1.61.1-jammy");
    expect(command.args.join(" ")).toContain("pnpm test:e2e:approved-routes");
    expect(command.args.join(" ")).toContain("READMATES_VISUAL_AUTHORITY_IDS=admin-today-mobile,host-prep-mobile");
  });

  it("passes the jammy renderer fingerprint and does not update snapshots", () => {
    const command = buildVisualAuthorityDockerCommand({
      packageManager: parsePnpmPackageManager("pnpm@11.13.1"),
      workspaceHostPath: "/repo",
      authorityIds: ["admin-today-desktop"],
    });
    const joined = command.args.join(" ");
    expect(command.command).toBe("docker");
    expect(command.args).toContain("--rm");
    expect(command.args).toContain("--ipc=host");
    expect(command.args).toContain("/work/front");
    expect(joined).toContain("READMATES_VISUAL_AUTHORITY_RENDERER_IMAGE=mcr.microsoft.com/playwright:v1.61.1-jammy");
    expect(joined).toContain("READMATES_VISUAL_AUTHORITY_BROWSER=chromium");
    expect(joined).toContain("READMATES_VISUAL_AUTHORITY_PLAYWRIGHT_VERSION=1.61.1");
    expect(joined).toContain("READMATES_VISUAL_AUTHORITY_PNPM_VERSION=11.13.1");
    expect(joined).toContain("READMATES_VISUAL_AUTHORITY_DPR=1");
    expect(joined).toContain("READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true");
    expect(joined).toContain("CI=true");
    expect(joined).toContain("pnpm install --frozen-lockfile");
    expect(joined).not.toContain("--update-snapshots");
    expect(joined).not.toContain("test:ct:approved");
  });

  it("exposes the exact package scripts without restoring component CT approved", () => {
    expect(frontPackageJson.scripts?.["test:e2e:approved-routes"]).toBe(
      "READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true playwright test tests/e2e/admin-approved-routes.spec.ts tests/e2e/host-approved-routes.spec.ts --project=chromium",
    );
    expect(frontPackageJson.scripts?.["test:e2e:approved-routes:docker"]).toBe(
      "tsx scripts/run-visual-authority-docker.ts",
    );
    expect(frontPackageJson.scripts?.["visual-authority:affected"]).toBe(
      "tsx scripts/list-affected-visual-authorities.ts",
    );
    expect(Object.keys(frontPackageJson.scripts ?? {}).some((name) => name.includes("ct:approved"))).toBe(false);
  });

  it("keeps the existing Playwright config covering stress specs on the Vite-only smoke path", () => {
    const playwrightConfig = readFileSync(new URL("../../playwright.config.ts", import.meta.url), "utf8");
    expect(playwrightConfig).toContain('testMatch: ["tests/e2e/**/*.spec.ts"]');
    expect(playwrightConfig).toContain('process.env.READMATES_VISUAL_AUTHORITY_SMOKE_ONLY === "true"');
    expect(playwrightConfig).toContain("pnpm exec vite");
    const smokeBranch = playwrightConfig.slice(
      playwrightConfig.indexOf("webServer: visualAuthoritySmokeOnly"),
      playwrightConfig.indexOf("] : ["),
    );
    expect(smokeBranch).toContain("pnpm exec vite");
    expect(smokeBranch).not.toContain("bootRun");
    expect(smokeBranch).not.toContain("../server/gradlew");
  });

  it("wires the fail-closed CI job to silent affected-path stdout", () => {
    const ciWorkflow = readFileSync(new URL("../../../.github/workflows/ci.yml", import.meta.url), "utf8");
    expect(ciWorkflow).toContain("fetch-depth: 0");
    expect(ciWorkflow).toContain("pnpm test:ct:docker");
    expect(ciWorkflow).toContain("pnpm --dir front --silent visual-authority:affected -- --changed-paths-file .tmp/visual-authority-changed-paths.txt");
    expect(ciWorkflow).toContain("printf 'READMATES_VISUAL_AUTHORITY_IDS=%s\\n' \"$ids\" >> \"$GITHUB_ENV\"");
    expect(ciWorkflow).not.toContain("READMATES_VISUAL_AUTHORITY_IDS<<EOF");
    expect(ciWorkflow).toContain("pnpm test:e2e:approved-routes:docker");
    expect(ciWorkflow).toContain("front/test-results/**/approved-mockup/*");
    expect(ciWorkflow).not.toContain("test:ct:approved");
  });
});

describe("visual authority affected paths", () => {
  it("maps a token change to every authority", () => {
    expect(approvedMockupIdsAffectedBy(["design/system/src/styles/tokens.css"])).toHaveLength(18);
    expect(resolveAffectedVisualAuthorities(["design/system/src/styles/tokens.css"]).ids).toHaveLength(18);
  });

  it("maps Admin Today CSS to the three Admin Today ids", () => {
    expect(resolveAffectedVisualAuthorities(["front/features/platform-admin/ui/admin-today.css"]).ids)
      .toEqual(["admin-today-desktop", "admin-today-mobile", "admin-work-detail-mobile"]);
  });

  it("maps a Host person CSS change to host-person-mobile", () => {
    expect(resolveAffectedVisualAuthorities(["front/features/host/ui/person/host-person-detail.css"]).ids)
      .toEqual(["host-person-mobile"]);
  });

  it("maps each approved PNG to only its own id", () => {
    for (const entry of APPROVED_MOCKUPS) {
      expect(resolveAffectedVisualAuthorities([approvedReferenceRepositoryPath(entry)]).ids)
        .toEqual([entry.id]);
    }
  });

  it("returns none for an unrelated server file", () => {
    expect(resolveAffectedVisualAuthorities(["server/src/main/kotlin/Example.kt"])).toEqual({
      ids: [],
      unmapped: [],
    });
  });

  it.each(TASK_PATH_TABLE)("maps Task 1-9 path %s to %s authorities", (path, count) => {
    const result = resolveAffectedVisualAuthorities([path]);
    expect(result.unmapped, path).toEqual([]);
    expect(result.ids, path).toHaveLength(count);
  });

  it("fails closed when a visual-sensitive path is unmapped", () => {
    const result = resolveAffectedVisualAuthorities(["front/src/styles/unknown-visual-token.css"]);
    expect(result.ids).toEqual([]);
    expect(result.unmapped).toEqual(["front/src/styles/unknown-visual-token.css"]);
  });

  it("prints a comma-separated manifest-ordered list and rejects a missing file", () => {
    const directory = mkdtempSync(join(tmpdir(), "visual-authority-paths-"));
    const changedPathsFile = join(directory, "changed.txt");
    writeFileSync(
      changedPathsFile,
      "front/features/platform-admin/ui/admin-today.css\nserver/src/main/kotlin/Example.kt\n",
    );
    const stdout: string[] = [];
    const code = runListAffectedVisualAuthorities(
      ["--changed-paths-file", changedPathsFile],
      {
        writeStdout: (text) => stdout.push(text),
        writeStderr: () => undefined,
      },
    );
    expect(code).toBe(0);
    expect(stdout.join("")).toBe("admin-today-desktop,admin-today-mobile,admin-work-detail-mobile\n");

    const missing = runListAffectedVisualAuthorities(
      ["--changed-paths-file", join(directory, "missing.txt")],
      {
        writeStdout: () => undefined,
        writeStderr: () => undefined,
      },
    );
    expect(missing).toBe(1);
    expect(runListAffectedVisualAuthorities(["--unknown-option"], {
      writeStdout: () => undefined,
      writeStderr: () => undefined,
    })).toBe(1);

    const forwarded: string[] = [];
    expect(runListAffectedVisualAuthorities(
      ["--", "--changed-paths-file", changedPathsFile],
      {
        writeStdout: (text) => forwarded.push(text),
        writeStderr: () => undefined,
      },
    )).toBe(0);
    expect(forwarded.join("")).toBe("admin-today-desktop,admin-today-mobile,admin-work-detail-mobile\n");
  });

  it("exits nonzero for an unmapped visual-sensitive path and succeeds with an empty line for unrelated docs", () => {
    const directory = mkdtempSync(join(tmpdir(), "visual-authority-unmapped-"));
    const unmappedFile = join(directory, "unmapped.txt");
    writeFileSync(unmappedFile, "front/src/styles/unknown-visual-token.css\n");
    expect(runListAffectedVisualAuthorities(["--changed-paths-file", unmappedFile], {
      writeStdout: () => undefined,
      writeStderr: () => undefined,
    })).toBe(1);

    const docsFile = join(directory, "docs.txt");
    writeFileSync(docsFile, "docs/development/architecture.md\nREADME.md\n");
    const stdout: string[] = [];
    expect(runListAffectedVisualAuthorities(["--changed-paths-file", docsFile], {
      writeStdout: (text) => stdout.push(text),
      writeStderr: () => undefined,
    })).toBe(0);
    expect(stdout.join("")).toBe("\n");
  });
});

describe("non-empty visual authority selection must execute tests", () => {
  it("fails when a filtered run skipped every matching test", () => {
    expect(() => assertPlaywrightRunExecutedMatchingTests("  18 skipped\n")).toThrow(
      /no matching tests/i,
    );
    expect(() => assertPlaywrightRunExecutedMatchingTests("  0 passed\n")).toThrow(/no matching tests/i);
    expect(() => assertPlaywrightRunExecutedMatchingTests("  2 passed (12s)\n  16 skipped\n")).not.toThrow();
    expect(() => assertPlaywrightRunExecutedMatchingTests("  1 failed\n  17 skipped\n")).not.toThrow();
  });
});
