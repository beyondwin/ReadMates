import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveE2eDatabaseName } from "../e2e/readmates-e2e-config";

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
