import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

const compatibilityCaseIds = new Set([
  "browser-v2-bff-v2v3-backend-support",
  "browser-v2-bff-v2v3-backend-enforce",
  "browser-v3-bff-v2only-blocked",
  "browser-v3-bff-v2v3-backend-v2only-forbidden",
  "browser-v3-bff-v2v3-backend-support",
  "browser-v3-bff-v2v3-backend-enforce",
  "reads-unaffected",
  "capability-probe-no-store",
  "member-approval",
  "invite",
  "notification-policy",
  "notification-preview",
  "notification-confirm",
  "notification-dispatch",
  "manual-resend-confirmation",
  "test-mail",
] as const);

type CompatibilityCaseId =
  | "browser-v2-bff-v2v3-backend-support"
  | "browser-v2-bff-v2v3-backend-enforce"
  | "browser-v3-bff-v2only-blocked"
  | "browser-v3-bff-v2v3-backend-v2only-forbidden"
  | "browser-v3-bff-v2v3-backend-support"
  | "browser-v3-bff-v2v3-backend-enforce"
  | "reads-unaffected"
  | "capability-probe-no-store"
  | "member-approval"
  | "invite"
  | "notification-policy"
  | "notification-preview"
  | "notification-confirm"
  | "notification-dispatch"
  | "manual-resend-confirmation"
  | "test-mail";

type EvidenceLayer = "browser" | "bff" | "backend" | "deploy-checker";
type ClientGeneration = "v2" | "v3" | "missing" | "unknown";
const evidenceLayers = new Set<EvidenceLayer>(["browser", "bff", "backend", "deploy-checker"]);
const clientGenerations = new Set<ClientGeneration>(["v2", "v3", "missing", "unknown"]);

export type HostRolloutObservation = {
  caseId: CompatibilityCaseId;
  layer: EvidenceLayer;
  generation: ClientGeneration;
  status: number;
};

export type HostRolloutEvidence = {
  schemaVersion: "readmates.host-rollout.local-observation.v1";
  cases: HostRolloutObservation[];
};

function validateObservation(observation: HostRolloutObservation) {
  if (!compatibilityCaseIds.has(observation.caseId)) {
    throw new Error("unknown compatibility case");
  }
  if (!evidenceLayers.has(observation.layer)) {
    throw new Error("invalid evidence layer");
  }
  if (!clientGenerations.has(observation.generation)) {
    throw new Error("invalid client generation");
  }
  if (!Number.isInteger(observation.status) || observation.status < 100 || observation.status > 599) {
    throw new Error("invalid response status");
  }
}

export function createHostRolloutEvidence(
  observations: readonly HostRolloutObservation[],
): HostRolloutEvidence {
  const seen = new Set<string>();
  const cases = observations.map((observation) => {
    validateObservation(observation);
    if (seen.has(observation.caseId)) {
      throw new Error("duplicate case observation");
    }
    seen.add(observation.caseId);
    return { ...observation };
  });

  return {
    schemaVersion: "readmates.host-rollout.local-observation.v1",
    cases,
  };
}

export function writeHostRolloutEvidence(
  target: string,
  evidence: HostRolloutEvidence,
) {
  const outputRoot = resolve("output/host-rollout");
  const resolvedTarget = resolve(target);
  if (!resolvedTarget.startsWith(`${outputRoot}${sep}`)) {
    throw new Error("outside ignored rollout output");
  }
  mkdirSync(dirname(resolvedTarget), { recursive: true });
  writeFileSync(resolvedTarget, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}
