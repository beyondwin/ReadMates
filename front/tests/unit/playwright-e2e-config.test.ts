import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { resolveE2eDatabaseName } from "../e2e/readmates-e2e-config";

async function backendWebServerCommand() {
  const { default: playwrightConfig } = await import("../../playwright.config");
  const webServer = playwrightConfig.webServer;
  const servers = Array.isArray(webServer) ? webServer : webServer ? [webServer] : [];
  const backend = servers.find((server) => server.command.includes("bootRun"));

  expect(backend).toBeDefined();
  return backend?.command ?? "";
}

async function loadPlaywrightConfigWithWorkers(workers: string | undefined) {
  const previousWorkers = process.env.PLAYWRIGHT_WORKERS;

  if (workers === undefined) {
    delete process.env.PLAYWRIGHT_WORKERS;
  } else {
    process.env.PLAYWRIGHT_WORKERS = workers;
  }

  vi.resetModules();

  try {
    const { default: playwrightConfig } = await import("../../playwright.config");
    return playwrightConfig;
  } finally {
    if (previousWorkers === undefined) {
      delete process.env.PLAYWRIGHT_WORKERS;
    } else {
      process.env.PLAYWRIGHT_WORKERS = previousWorkers;
    }
    vi.resetModules();
  }
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

  it("keeps one worker by default and supports explicit worker opt-in", async () => {
    await expect(loadPlaywrightConfigWithWorkers(undefined)).resolves.toMatchObject({ workers: 1 });
    await expect(loadPlaywrightConfigWithWorkers("2")).resolves.toMatchObject({ workers: 2 });
  });
});
