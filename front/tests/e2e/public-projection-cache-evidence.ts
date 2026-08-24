import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const cacheSafetyCases: Record<string, readonly string[]> = {
  "seed-r2a-prechange-cache": ["browser-previous-policy-720s"],
  "deploy-r2a-cache-policy": [
    "origin-immediate-deny",
    "bff-generation-deny",
    "cdn-old-generation-not-served",
  ],
  "playwright-r2a-cache-safety": [
    "browser-general-120s",
    "browser-emergency-60s",
    "browser-proof-after-wait",
  ],
};

type EvidenceEnvironment = NodeJS.ProcessEnv;

export type CacheSafetyEvidenceConfig = {
  commandId: string;
  phase: string;
  originBaseUrl: URL;
  bffBaseUrl: URL;
  cdnBaseUrl: URL;
  publicClubPath: string;
  publicSessionPath: string;
  revokedSessionPath: string;
  expectedOriginRevokedUrl: string;
  expectedBffRevokedUrl: string;
  expectedCdnRevokedUrl: string;
  expectedCdnClubUrl: string;
  expectedCdnStableSessionUrl: string;
  oldGenerationEtag: string;
  primedBrowserProfile: string;
  primedBrowserState: string;
  primedBrowserArtifactId: string;
  prechangePrimedAt: Date | null;
  policyDeployedAt: Date | null;
  waitCompletedAt: Date | null;
};

export type PrimedBrowserState = {
  schemaVersion: "readmates.public-cache.prime.v1";
  artifactId: string;
  profileNonce: string;
  primeUrl: string;
  oldGenerationEtag: string;
  primedAt: string;
};

export type ExactBoundaryObservation = {
  expectedUrl: string;
  responseUrl: string;
  status: number;
  redirectedFromUrl?: string | null;
  finalPageUrl?: string;
};

export function protectedEvidenceEnabled(env: EvidenceEnvironment = process.env) {
  return env.GITHUB_ACTIONS === "true" && env.READMATES_HOST_ROLLOUT_LIVE_EVIDENCE === "protected";
}

export function requireCacheSafetyEvidenceConfig(
  commandId: string,
  env: EvidenceEnvironment = process.env,
): CacheSafetyEvidenceConfig {
  if (!protectedEvidenceEnabled(env)) throw new Error("protected rollout evidence is not enabled");
  if (env.READMATES_HOST_ROLLOUT_COMMAND_ID !== commandId) {
    throw new Error(`rollout command mismatch for ${commandId}`);
  }
  if (!cacheSafetyCases[commandId]) throw new Error(`unsupported cache-safety command ${commandId}`);

  const originBaseUrl = absoluteHttpUrl(env, "READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL");
  const bffBaseUrl = absoluteHttpUrl(env, "READMATES_HOST_ROLLOUT_BFF_BASE_URL");
  const cdnBaseUrl = absoluteHttpUrl(env, "READMATES_HOST_ROLLOUT_CDN_BASE_URL");
  if (new Set([originBaseUrl.href, bffBaseUrl.href, cdnBaseUrl.href]).size !== 3) {
    throw new Error("origin, BFF, and CDN evidence boundaries must be distinct");
  }
  const publicClubPath = absolutePath(env, "READMATES_HOST_ROLLOUT_PUBLIC_CLUB_PATH");
  const publicSessionPath = absolutePath(env, "READMATES_HOST_ROLLOUT_PUBLIC_SESSION_PATH");
  const revokedSessionPath = absolutePath(env, "READMATES_HOST_ROLLOUT_REVOKED_SESSION_PATH");
  const originRevokedUrl = boundaryUrl(originBaseUrl, revokedSessionPath);
  const bffRevokedUrl = boundaryUrl(bffBaseUrl, revokedSessionPath, true);
  const cdnRevokedUrl = boundaryUrl(cdnBaseUrl, revokedSessionPath, true);
  const cdnClubUrl = boundaryUrl(cdnBaseUrl, publicClubPath, true);
  const cdnStableSessionUrl = boundaryUrl(cdnBaseUrl, publicSessionPath, true);

  return {
    commandId,
    phase: required(env, "READMATES_ROLLOUT_CACHE_PHASE"),
    originBaseUrl,
    bffBaseUrl,
    cdnBaseUrl,
    publicClubPath,
    publicSessionPath,
    revokedSessionPath,
    expectedOriginRevokedUrl: trustedExactUrl(env, "READMATES_HOST_ROLLOUT_EXPECTED_ORIGIN_REVOKED_URL", originRevokedUrl),
    expectedBffRevokedUrl: trustedExactUrl(env, "READMATES_HOST_ROLLOUT_EXPECTED_BFF_REVOKED_URL", bffRevokedUrl),
    expectedCdnRevokedUrl: trustedExactUrl(env, "READMATES_HOST_ROLLOUT_EXPECTED_CDN_REVOKED_URL", cdnRevokedUrl),
    expectedCdnClubUrl: trustedExactUrl(env, "READMATES_HOST_ROLLOUT_EXPECTED_CDN_CLUB_URL", cdnClubUrl),
    expectedCdnStableSessionUrl: trustedExactUrl(
      env,
      "READMATES_HOST_ROLLOUT_EXPECTED_CDN_STABLE_SESSION_URL",
      cdnStableSessionUrl,
    ),
    oldGenerationEtag: required(env, "READMATES_HOST_ROLLOUT_OLD_GENERATION_ETAG"),
    primedBrowserProfile: absoluteFilePath(env, "READMATES_HOST_ROLLOUT_PRIMED_BROWSER_PROFILE"),
    primedBrowserState: absoluteFilePath(env, "READMATES_HOST_ROLLOUT_PRIMED_BROWSER_STATE"),
    primedBrowserArtifactId: required(env, "READMATES_HOST_ROLLOUT_PRIMED_BROWSER_ARTIFACT_ID"),
    prechangePrimedAt: optionalTimestamp(env, "READMATES_HOST_ROLLOUT_PRECHANGE_PRIMED_AT"),
    policyDeployedAt: optionalTimestamp(env, "READMATES_HOST_ROLLOUT_POLICY_DEPLOYED_AT"),
    waitCompletedAt: optionalTimestamp(env, "READMATES_HOST_ROLLOUT_WAIT_COMPLETED_AT"),
  };
}

export function writePrimedBrowserState(
  config: CacheSafetyEvidenceConfig,
  state: PrimedBrowserState,
) {
  if (config.phase !== "pre-change") throw new Error("browser priming requires pre-change phase");
  writeFileSync(config.primedBrowserState, `${JSON.stringify(state)}\n`, { flag: "wx" });
  writeFileSync(profileMarker(config.primedBrowserProfile, state.profileNonce), `${state.artifactId}\n`, {
    flag: "wx",
  });
}

export function readVerifiedPrimedBrowserState(config: CacheSafetyEvidenceConfig): PrimedBrowserState {
  if (config.phase !== "post-wait") throw new Error("browser proof requires post-wait phase");
  if (!config.prechangePrimedAt || !config.policyDeployedAt || !config.waitCompletedAt) {
    throw new Error("post-wait evidence requires primed, deployed, and wait timestamps");
  }
  if (config.policyDeployedAt < config.prechangePrimedAt) throw new Error("policy predates browser prime");
  if (config.waitCompletedAt.getTime() - config.policyDeployedAt.getTime() < 720_000) {
    throw new Error("720-second cache-safety wait was not completed");
  }
  const state = JSON.parse(readFileSync(config.primedBrowserState, "utf8")) as PrimedBrowserState;
  if (state.schemaVersion !== "readmates.public-cache.prime.v1") throw new Error("invalid primed browser state schema");
  if (state.artifactId !== config.primedBrowserArtifactId) throw new Error("primed browser artifact mismatch");
  if (state.oldGenerationEtag !== config.oldGenerationEtag) throw new Error("primed validator mismatch");
  if (canonicalExactUrl(state.primeUrl, "primed browser target") !== config.expectedCdnRevokedUrl) {
    throw new Error("primed browser target mismatch");
  }
  if (new Date(state.primedAt).getTime() !== config.prechangePrimedAt.getTime()) {
    throw new Error("primed timestamp mismatch");
  }
  if (!existsSync(profileMarker(config.primedBrowserProfile, state.profileNonce))) {
    throw new Error("primed browser profile marker is missing");
  }
  return state;
}

export function writePassingCacheSafetyReport(
  commandId: string,
  provenCases: ReadonlySet<string>,
  env: EvidenceEnvironment = process.env,
) {
  const expected = cacheSafetyCases[commandId];
  if (!expected || [...provenCases].sort().join("\n") !== [...expected].sort().join("\n")) {
    throw new Error(`not every ${commandId} case was causally proven`);
  }
  const config = requireCacheSafetyEvidenceConfig(commandId, env);
  if (commandId === "seed-r2a-prechange-cache" || commandId === "playwright-r2a-cache-safety") {
    readVerifiedPrimedBrowserState(config);
  } else if (config.phase !== "policy-deployed" || !config.policyDeployedAt) {
    throw new Error("deployed policy evidence requires its boundary timestamp");
  }
  const output = absoluteFilePath(env, "READMATES_HOST_ROLLOUT_CASE_REPORT");
  writeFileSync(
    output,
    `${JSON.stringify({
      schemaVersion: "readmates.host-rollout.test-report.v1",
      group: "cache-safety",
      commands: [{ id: commandId, result: "PASS", source: "structured-test-reporter" }],
      cases: [...provenCases].sort().map((id) => ({ id, result: "PASS", commandId })),
      completedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    })}\n`,
    { flag: "wx" },
  );
}

export function assertExactBoundaryObservation(observation: ExactBoundaryObservation) {
  const expectedUrl = canonicalExactUrl(observation.expectedUrl, "expected boundary URL");
  if (observation.status >= 300 && observation.status < 400) {
    throw new Error("protected boundary rejected an HTTP redirect response");
  }
  if (observation.redirectedFromUrl) {
    throw new Error("protected browser boundary rejected a redirect chain");
  }
  if (canonicalExactUrl(observation.responseUrl, "response URL") !== expectedUrl) {
    throw new Error("protected boundary response URL is not canonical-exact");
  }
  if (
    observation.finalPageUrl &&
    canonicalExactUrl(observation.finalPageUrl, "final page URL") !== expectedUrl
  ) {
    throw new Error("protected browser final page URL is not canonical-exact");
  }
}

function required(env: EvidenceEnvironment, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for protected evidence`);
  return value;
}

function absoluteHttpUrl(env: EvidenceEnvironment, name: string) {
  const value = new URL(canonicalExactUrl(required(env, name), name));
  if (value.protocol !== "https:" || value.pathname !== "/" || value.search) {
    throw new Error(`${name} must be an origin-only HTTPS URL`);
  }
  return value;
}

function absolutePath(env: EvidenceEnvironment, name: string) {
  const value = required(env, name);
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("..") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    throw new Error(`${name} must be an absolute safe URL path`);
  }
  return value;
}

function trustedExactUrl(env: EvidenceEnvironment, name: string, derivedUrl: string) {
  const trustedUrl = canonicalExactUrl(required(env, name), name);
  if (trustedUrl !== canonicalExactUrl(derivedUrl, `${name} derived URL`)) {
    throw new Error(`${name} does not match its protected boundary and target`);
  }
  return trustedUrl;
}

function boundaryUrl(base: URL, path: string, bff = false) {
  return canonicalExactUrl(new URL(`${bff ? "/api/bff" : ""}${path}`, base).href, "boundary URL");
}

function canonicalExactUrl(raw: string, label: string) {
  let value: URL;
  try {
    value = new URL(raw);
  } catch {
    throw new Error(`${label} is not an absolute URL`);
  }
  if (value.protocol !== "https:" || value.username || value.password || value.hash) {
    throw new Error(`${label} must be a credential-free HTTPS URL without a fragment`);
  }
  const canonicalHostname = value.hostname.replace(/\.$/, "").toLowerCase();
  if (!canonicalHostname) throw new Error(`${label} must have a hostname`);
  value.hostname = canonicalHostname;
  if (value.port === "443") value.port = "";
  return value.href;
}

function absoluteFilePath(env: EvidenceEnvironment, name: string) {
  const value = required(env, name);
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute file path`);
  return value;
}

function optionalTimestamp(env: EvidenceEnvironment, name: string) {
  const raw = env[name]?.trim();
  if (!raw) return null;
  const timestamp = new Date(raw);
  if (Number.isNaN(timestamp.getTime())) throw new Error(`${name} must be an ISO-8601 timestamp`);
  return timestamp;
}

function profileMarker(profilePath: string, nonce: string) {
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(nonce)) throw new Error("invalid browser profile nonce");
  return join(profilePath, `.readmates-public-cache-prime-${nonce}`);
}
