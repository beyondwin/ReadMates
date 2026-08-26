import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { resolveE2eDatabaseName } from "../e2e/readmates-e2e-config";

const frontPackageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const ciWorkflow = readFileSync(resolve("..", ".github/workflows/ci.yml"), "utf8");
const performanceConfigSource = readFileSync(resolve("playwright-performance.config.ts"), "utf8");

async function backendWebServerCommand() {
  const { default: playwrightConfig } = await import("../../playwright.config");
  const webServer = playwrightConfig.webServer;
  const servers = Array.isArray(webServer) ? webServer : webServer ? [webServer] : [];
  const backend = servers.find((server) => server.command.includes("bootRun"));

  expect(backend).toBeDefined();
  return backend?.command ?? "";
}

async function loadPlaywrightConfigWithEnv(env: {
  PLAYWRIGHT_WORKERS?: string;
  READMATES_VISUAL_AUTHORITY_SMOKE_ONLY?: string;
  READMATES_HOST_WORKSPACE_SMOKE_ONLY?: string;
}) {
  const previous = {
    PLAYWRIGHT_WORKERS: process.env.PLAYWRIGHT_WORKERS,
    READMATES_VISUAL_AUTHORITY_SMOKE_ONLY: process.env.READMATES_VISUAL_AUTHORITY_SMOKE_ONLY,
    READMATES_HOST_WORKSPACE_SMOKE_ONLY: process.env.READMATES_HOST_WORKSPACE_SMOKE_ONLY,
  };

  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  vi.resetModules();

  try {
    const { default: playwrightConfig } = await import("../../playwright.config");
    return playwrightConfig;
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    vi.resetModules();
  }
}

async function loadPlaywrightConfigWithWorkers(workers: string | undefined) {
  return loadPlaywrightConfigWithEnv({ PLAYWRIGHT_WORKERS: workers });
}

function webServersOf(config: { webServer?: unknown }) {
  const webServer = config.webServer;
  return Array.isArray(webServer) ? webServer : webServer ? [webServer] : [];
}

describe("Playwright E2E database config", () => {
  it("uses an explicit E2E database name unchanged", () => {
    expect(resolveE2eDatabaseName("readmates_e2e_manual")).toBe("readmates_e2e_manual");
  });

  it("derives the default database name from migration contents", async () => {
    const root = await mkdtemp(join(tmpdir(), "readmates-e2e-config-"));

    try {
      const migrationDir = join(root, "migration");
      const devDir = join(root, "dev");
      mkdirSync(migrationDir);
      mkdirSync(devDir);

      writeFileSync(join(migrationDir, "V1__base.sql"), "create table books(id bigint);\n");
      writeFileSync(join(devDir, "V99__seed.sql"), "insert into books(id) values (1);\n");

      const firstName = resolveE2eDatabaseName(undefined, [migrationDir, devDir]);

      writeFileSync(join(devDir, "V99__seed.sql"), "insert into books(id) values (2);\n");
      const secondName = resolveE2eDatabaseName(undefined, [migrationDir, devDir]);

      expect(firstName).toMatch(/^readmates_e2e_[0-9a-f]{12}$/);
      expect(secondName).toMatch(/^readmates_e2e_[0-9a-f]{12}$/);
      expect(secondName).not.toBe(firstName);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Playwright E2E backend web server config", () => {
  it("provides an explicit public-safe IP hash base secret", async () => {
    await expect(backendWebServerCommand()).resolves.toContain(
      "READMATES_IP_HASH_BASE_SECRET='test-secret'",
    );
  });

  it("provides an explicit public-safe admin command digest key", async () => {
    await expect(backendWebServerCommand()).resolves.toContain(
      "READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY='test-admin-command-digest-key'",
    );
  });

  it("provides explicit public-safe host cursor and mutation identity keys", async () => {
    const command = await backendWebServerCommand();

    expect(command).toContain("READMATES_HOST_LIST_CURSOR_CURRENT_KEY='e2e-host-list-cursor-key'");
    expect(command).toContain("READMATES_MUTATION_IDENTITY_CURRENT_KEY='e2e-mutation-identity-key'");
  });

  it("keeps one worker by default and supports explicit worker opt-in", async () => {
    await expect(loadPlaywrightConfigWithWorkers(undefined)).resolves.toMatchObject({ workers: 1 });
    await expect(loadPlaywrightConfigWithWorkers("2")).resolves.toMatchObject({ workers: 2 });
  });
});

describe("visual-authority browser gate", () => {
  it("adds a canonical smoke script and keeps the host-only script as an alias", () => {
    const visualAuthority = frontPackageJson.scripts?.["test:e2e:visual-authority-browsers"] ?? "";
    const hostOnly = frontPackageJson.scripts?.["test:e2e:host-workspace-browsers"] ?? "";

    expect(visualAuthority).toContain("READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true");
    expect(visualAuthority).toContain("tests/e2e/host-meeting-workspace-browser-smoke.spec.ts");
    expect(visualAuthority).toContain("tests/e2e/admin-editorial-ledger-browser-smoke.spec.ts");
    expect(visualAuthority).toContain("--project=chromium");
    expect(visualAuthority).toContain("--project=firefox-host");
    expect(visualAuthority).toContain("--project=webkit-mobile-host");
    expect(visualAuthority).toContain("--project=firefox-admin");
    expect(visualAuthority).toContain("--project=webkit-mobile-admin");

    expect(hostOnly).toContain("READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true");
    expect(hostOnly).toContain("tests/e2e/host-meeting-workspace-browser-smoke.spec.ts");
    expect(hostOnly).toContain("--project=firefox-host");
    expect(hostOnly).toContain("--project=webkit-mobile-host");
    expect(hostOnly).not.toContain("admin-editorial-ledger-browser-smoke.spec.ts");
    expect(hostOnly).not.toContain("firefox-admin");
  });

  it("scopes firefox-admin and webkit-mobile-admin to the admin editorial ledger smoke", async () => {
    const config = await loadPlaywrightConfigWithEnv({});
    const projects = config.projects ?? [];
    const byName = Object.fromEntries(projects.map((project) => [project.name, project]));

    expect(byName["firefox-admin"]?.testMatch).toEqual([
      "tests/e2e/admin-editorial-ledger-browser-smoke.spec.ts",
    ]);
    expect(byName["webkit-mobile-admin"]?.testMatch).toEqual([
      "tests/e2e/admin-editorial-ledger-browser-smoke.spec.ts",
    ]);
    expect(byName["firefox-host"]?.testMatch).toEqual([
      "tests/e2e/host-meeting-workspace-browser-smoke.spec.ts",
    ]);
    expect(byName["webkit-mobile-host"]?.testMatch).toEqual([
      "tests/e2e/host-meeting-workspace-browser-smoke.spec.ts",
    ]);
  });

  it("uses a generic Vite-only smoke mode for visual-authority and the host alias", async () => {
    const visualAuthority = await loadPlaywrightConfigWithEnv({
      READMATES_VISUAL_AUTHORITY_SMOKE_ONLY: "true",
    });
    const visualServers = webServersOf(visualAuthority);
    expect(visualServers).toHaveLength(1);
    expect(visualServers[0]?.command).toContain("vite");
    expect(visualServers.some((server) => server.command.includes("bootRun"))).toBe(false);

    const hostAlias = await loadPlaywrightConfigWithEnv({
      READMATES_HOST_WORKSPACE_SMOKE_ONLY: "true",
    });
    const hostServers = webServersOf(hostAlias);
    expect(hostServers).toHaveLength(1);
    expect(hostServers[0]?.command).toContain("vite");
    expect(hostServers.some((server) => server.command.includes("bootRun"))).toBe(false);
  });

  it("wires the visual-authority browser gate in CI without dropping host performance", () => {
    expect(ciWorkflow).toContain("pnpm test:e2e:visual-authority-browsers");
    expect(ciWorkflow).toContain("pnpm test:host-workspace-performance");
    expect(performanceConfigSource).toContain("tests/performance/host-meeting-workspace-performance.spec.ts");
    expect(performanceConfigSource).toContain("chromium-performance");
  });
});
