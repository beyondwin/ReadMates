import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildCtDockerCommand,
  CT_DOCKER_IMAGE,
  CT_FRONT_NODE_MODULES_VOLUME,
  CT_PNPM_STORE_VOLUME,
  CT_ROOT_NODE_MODULES_VOLUME,
  parsePnpmPackageManager,
} from "./ct-docker";

const rootPackageJson = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as { packageManager?: string; engines?: { node?: string; pnpm?: string } };
const frontPackageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { packageManager?: string };

describe("CT Docker command helpers", () => {
  it("parses a pnpm packageManager string", () => {
    expect(parsePnpmPackageManager("pnpm@11.13.1")).toEqual({
      raw: "pnpm@11.13.1",
      name: "pnpm",
      version: "11.13.1",
    });
  });

  it("rejects missing or non-pnpm packageManager values", () => {
    expect(() => parsePnpmPackageManager("")).toThrow(
      "Expected root package.json packageManager to match pnpm@version",
    );
    expect(() => parsePnpmPackageManager("npm@10.0.0")).toThrow(
      "Expected root package.json packageManager to match pnpm@version",
    );
    expect(() => parsePnpmPackageManager("pnpm")).toThrow(
      "Expected root package.json packageManager to match pnpm@version",
    );
  });

  it("keeps Node and pnpm aligned with the repository contract", () => {
    expect(rootPackageJson.packageManager).toBe("pnpm@11.13.1");
    expect(frontPackageJson.packageManager).toBe(rootPackageJson.packageManager);
    expect(rootPackageJson.engines).toEqual({
      node: "24.x",
      pnpm: "11.13.1",
    });
  });

  it("builds verification command without a snapshot update flag", () => {
    const command = buildCtDockerCommand({
      packageManager: parsePnpmPackageManager("pnpm@11.13.1"),
      mode: "verify",
      workspaceHostPath: "/repo",
    });

    expect(command.command).toBe("docker");
    expect(CT_DOCKER_IMAGE).toBe("mcr.microsoft.com/playwright:v1.61.1-jammy");
    expect(command.args).toContain(CT_DOCKER_IMAGE);
    expect(command.args).toContain("READMATES_CT_PACKAGE_MANAGER=pnpm@11.13.1");
    expect(command.args).toContain(`${CT_ROOT_NODE_MODULES_VOLUME}:/work/node_modules`);
    expect(command.args).toContain(`${CT_FRONT_NODE_MODULES_VOLUME}:/work/front/node_modules`);
    expect(command.args).toContain(`${CT_PNPM_STORE_VOLUME}:/pnpm-store`);
    expect(command.args.join(" ")).toContain('corepack prepare "$READMATES_CT_PACKAGE_MANAGER" --activate');
    expect(command.args.join(" ")).toContain("pnpm exec playwright test --config=playwright-ct.config.ts");
    expect(command.args.join(" ")).not.toContain("--update-snapshots");
  });

  it("adds update flag only for baseline update mode", () => {
    const command = buildCtDockerCommand({
      packageManager: parsePnpmPackageManager("pnpm@11.13.1"),
      mode: "update",
      workspaceHostPath: "/repo",
    });

    expect(command.args.join(" ")).toContain(
      "pnpm exec playwright test --config=playwright-ct.config.ts --update-snapshots",
    );
  });
});
