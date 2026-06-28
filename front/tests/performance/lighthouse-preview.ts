import type { LighthouseRouteGroup } from "../lighthouse/types";

export type PreviewCommandInput = {
  baseUrl: string;
  outputDir: string;
  group?: LighthouseRouteGroup;
  limit?: number;
};

export type PreviewCommand = {
  command: "tsx";
  args: string[];
  env: Record<string, string>;
};

export type PreviewServerEnvInput = {
  apiBaseUrl: string;
};

export type PreviewShutdown = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

export function previewOutputDir(timestampSlug: string): string {
  return `../.tmp/performance/lighthouse-preview/${timestampSlug}`;
}

export function buildPreviewServerEnv(input: PreviewServerEnvInput): Record<string, string> {
  return {
    READMATES_API_BASE_URL: input.apiBaseUrl,
  };
}

export function isExpectedPreviewShutdown(exit: PreviewShutdown): boolean {
  return exit.code === 0 || exit.code === 143 || exit.signal === "SIGTERM";
}

export function buildPreviewCommand(input: PreviewCommandInput): PreviewCommand {
  const args = ["scripts/lighthouse-diagnostic.ts"];
  if (input.group) {
    args.push("--group", input.group);
  }
  if (input.limit !== undefined) {
    args.push("--limit", String(input.limit));
  }

  return {
    command: "tsx",
    args,
    env: {
      LIGHTHOUSE_BASE_URL: input.baseUrl,
      LIGHTHOUSE_OUTPUT_DIR: input.outputDir,
      LIGHTHOUSE_SERVER_PROFILE: "vite-preview",
    },
  };
}
