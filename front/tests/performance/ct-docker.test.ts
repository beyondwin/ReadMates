import { describe, expect, it } from "vitest";

import {
  buildCtDockerCommand,
  CT_DOCKER_IMAGE,
  CT_FRONT_NODE_MODULES_VOLUME,
  CT_PNPM_STORE_VOLUME,
  CT_ROOT_NODE_MODULES_VOLUME,
  parsePnpmPackageManager,
} from "./ct-docker";

describe("CT Docker command helpers", () => {
  it("parses a pnpm packageManager string", () => {
    expect(parsePnpmPackageManager("pnpm@10.33.0")).toEqual({
      raw: "pnpm@10.33.0",
      name: "pnpm",
      version: "10.33.0",
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

  it("builds verification command without a snapshot update flag", () => {
    const command = buildCtDockerCommand({
      packageManager: parsePnpmPackageManager("pnpm@10.33.0"),
      mode: "verify",
      workspaceHostPath: "/repo",
    });

    expect(command.command).toBe("docker");
    expect(command.args).toContain(CT_DOCKER_IMAGE);
    expect(command.args).toContain("READMATES_CT_PACKAGE_MANAGER=pnpm@10.33.0");
    expect(command.args).toContain(`${CT_ROOT_NODE_MODULES_VOLUME}:/work/node_modules`);
    expect(command.args).toContain(`${CT_FRONT_NODE_MODULES_VOLUME}:/work/front/node_modules`);
    expect(command.args).toContain(`${CT_PNPM_STORE_VOLUME}:/pnpm-store`);
    expect(command.args.join(" ")).toContain('corepack prepare "$READMATES_CT_PACKAGE_MANAGER" --activate');
    expect(command.args.join(" ")).toContain("pnpm exec playwright test --config=playwright-ct.config.ts");
    expect(command.args.join(" ")).not.toContain("--update-snapshots");
  });

  it("adds update flag only for baseline update mode", () => {
    const command = buildCtDockerCommand({
      packageManager: parsePnpmPackageManager("pnpm@10.33.0"),
      mode: "update",
      workspaceHostPath: "/repo",
    });

    expect(command.args.join(" ")).toContain(
      "pnpm exec playwright test --config=playwright-ct.config.ts --update-snapshots",
    );
  });
});
