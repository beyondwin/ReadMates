export const CT_DOCKER_IMAGE = "mcr.microsoft.com/playwright:v1.61.1-jammy";
export const CT_ROOT_NODE_MODULES_VOLUME = "readmates-ct-root-node-modules";
export const CT_FRONT_NODE_MODULES_VOLUME = "readmates-ct-front-node-modules";
export const CT_PNPM_STORE_VOLUME = "readmates-ct-pnpm-store";

export type PnpmPackageManager = {
  raw: string;
  name: "pnpm";
  version: string;
};

export type CtDockerMode = "verify" | "update";

export type CtDockerCommandInput = {
  packageManager: PnpmPackageManager;
  mode: CtDockerMode;
  workspaceHostPath: string;
};

export type CtDockerCommand = {
  command: "docker";
  args: string[];
};

export function parsePnpmPackageManager(value: string): PnpmPackageManager {
  const match = value.match(/^pnpm@(\S+)$/);
  if (!match) {
    throw new Error(`Expected root package.json packageManager to match pnpm@version, got: ${value || "(empty)"}`);
  }

  return {
    raw: value,
    name: "pnpm",
    version: match[1],
  };
}

function shellEscapeDoubleQuoted(value: string): string {
  return value.replace(/["\\$`]/g, "\\$&");
}

export function buildCtDockerCommand(input: CtDockerCommandInput): CtDockerCommand {
  const playwrightArgs = ["pnpm", "exec", "playwright", "test", "--config=playwright-ct.config.ts"];
  if (input.mode === "update") {
    playwrightArgs.push("--update-snapshots");
  }

  const containerScript = [
    "set -eu",
    "corepack enable",
    'corepack prepare "$READMATES_CT_PACKAGE_MANAGER" --activate',
    'resolved_pnpm_version="$(pnpm --version)"',
    'expected_pnpm_version="${READMATES_CT_PACKAGE_MANAGER#pnpm@}"',
    'if [ "$resolved_pnpm_version" != "$expected_pnpm_version" ]; then',
    '  echo "Expected pnpm $expected_pnpm_version, got $resolved_pnpm_version" >&2',
    "  exit 1",
    "fi",
    "pnpm config set store-dir /pnpm-store",
    "pnpm install --frozen-lockfile=false",
    playwrightArgs.map(shellEscapeDoubleQuoted).join(" "),
  ].join("\n");

  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      "--ipc=host",
      "-e",
      "CI=true",
      "-e",
      `READMATES_CT_PACKAGE_MANAGER=${input.packageManager.raw}`,
      "-v",
      `${input.workspaceHostPath}:/work`,
      "-v",
      `${CT_ROOT_NODE_MODULES_VOLUME}:/work/node_modules`,
      "-v",
      `${CT_FRONT_NODE_MODULES_VOLUME}:/work/front/node_modules`,
      "-v",
      `${CT_PNPM_STORE_VOLUME}:/pnpm-store`,
      "-w",
      "/work/front",
      CT_DOCKER_IMAGE,
      "/bin/sh",
      "-lc",
      containerScript,
    ],
  };
}
