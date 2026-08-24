import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertExactBoundaryObservation,
  readVerifiedPrimedBrowserState,
  requireCacheSafetyEvidenceConfig,
  writePrimedBrowserState,
  writePassingCacheSafetyReport,
} from "../e2e/public-projection-cache-evidence";

function evidenceEnv(root: string): NodeJS.ProcessEnv {
  const profile = join(root, "profile");
  mkdirSync(profile);
  return {
    GITHUB_ACTIONS: "true",
    READMATES_HOST_ROLLOUT_LIVE_EVIDENCE: "protected",
    READMATES_HOST_ROLLOUT_COMMAND_ID: "seed-r2a-prechange-cache",
    READMATES_ROLLOUT_CACHE_PHASE: "post-wait",
    READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL: "https://origin.example.test",
    READMATES_HOST_ROLLOUT_BFF_BASE_URL: "https://bff.example.test",
    READMATES_HOST_ROLLOUT_CDN_BASE_URL: "https://cdn.example.test",
    READMATES_HOST_ROLLOUT_PUBLIC_CLUB_PATH: "/api/public/clubs/example",
    READMATES_HOST_ROLLOUT_PUBLIC_SESSION_PATH: "/api/public/clubs/example/sessions/public",
    READMATES_HOST_ROLLOUT_REVOKED_SESSION_PATH: "/api/public/clubs/example/sessions/revoked",
    READMATES_HOST_ROLLOUT_EXPECTED_ORIGIN_REVOKED_URL:
      "https://origin.example.test/api/public/clubs/example/sessions/revoked",
    READMATES_HOST_ROLLOUT_EXPECTED_BFF_REVOKED_URL:
      "https://bff.example.test/api/bff/api/public/clubs/example/sessions/revoked",
    READMATES_HOST_ROLLOUT_EXPECTED_CDN_REVOKED_URL:
      "https://cdn.example.test/api/bff/api/public/clubs/example/sessions/revoked",
    READMATES_HOST_ROLLOUT_EXPECTED_CDN_CLUB_URL:
      "https://cdn.example.test/api/bff/api/public/clubs/example",
    READMATES_HOST_ROLLOUT_EXPECTED_CDN_STABLE_SESSION_URL:
      "https://cdn.example.test/api/bff/api/public/clubs/example/sessions/public",
    READMATES_HOST_ROLLOUT_OLD_GENERATION_ETAG: '"public-record-g4-r0"',
    READMATES_HOST_ROLLOUT_PRIMED_BROWSER_PROFILE: profile,
    READMATES_HOST_ROLLOUT_PRIMED_BROWSER_STATE: join(root, "state.json"),
    READMATES_HOST_ROLLOUT_PRIMED_BROWSER_ARTIFACT_ID: "artifact-example",
    READMATES_HOST_ROLLOUT_PRECHANGE_PRIMED_AT: "2026-08-24T00:00:00Z",
    READMATES_HOST_ROLLOUT_POLICY_DEPLOYED_AT: "2026-08-24T00:01:00Z",
    READMATES_HOST_ROLLOUT_WAIT_COMPLETED_AT: "2026-08-24T00:13:00Z",
    READMATES_HOST_ROLLOUT_CASE_REPORT: join(root, "report.json"),
  };
}

describe("public projection cache evidence", () => {
  it("rejects the legacy live flag and missing real boundary inputs", () => {
    expect(() =>
      requireCacheSafetyEvidenceConfig("seed-r2a-prechange-cache", {
        GITHUB_ACTIONS: "true",
        READMATES_HOST_ROLLOUT_LIVE: "protected",
      }),
    ).toThrow("protected rollout evidence is not enabled");
  });

  it("rejects protected evidence with a missing deployed boundary", () => {
    const root = mkdtempSync(join(tmpdir(), "readmates-cache-evidence-"));
    const env = evidenceEnv(root);
    delete env.READMATES_HOST_ROLLOUT_CDN_BASE_URL;

    expect(() => requireCacheSafetyEvidenceConfig("seed-r2a-prechange-cache", env)).toThrow(
      "READMATES_HOST_ROLLOUT_CDN_BASE_URL is required",
    );
  });

  it.each([
    {
      label: "same-origin",
      responseUrl: "https://cdn.example.test/api/bff/api/public/clubs/example/sessions/redirected",
    },
    {
      label: "cross-origin",
      responseUrl: "https://redirected.example.test/api/bff/api/public/clubs/example/sessions/revoked",
    },
  ])("rejects a $label redirect before any protected case or report can be emitted", ({ responseUrl }) => {
    const root = mkdtempSync(join(tmpdir(), "readmates-cache-evidence-"));
    const env = evidenceEnv(root);
    const expectedUrl = env.READMATES_HOST_ROLLOUT_EXPECTED_CDN_REVOKED_URL!;
    const provenCases = new Set<string>();

    expect(() => {
      assertExactBoundaryObservation({
        expectedUrl,
        responseUrl,
        status: 200,
        redirectedFromUrl: expectedUrl,
        finalPageUrl: responseUrl,
      });
      provenCases.add("browser-previous-policy-720s");
    }).toThrow("redirect");
    expect(provenCases).toEqual(new Set());
    expect(() => writePassingCacheSafetyReport("seed-r2a-prechange-cache", provenCases, env)).toThrow(
      "causally proven",
    );
    expect(() => readFileSync(env.READMATES_HOST_ROLLOUT_CASE_REPORT!, "utf8")).toThrow();
  });

  it("canonicalizes trusted scheme host IDNA default port path and query before exact comparison", () => {
    expect(() =>
      assertExactBoundaryObservation({
        expectedUrl: "HTTPS://XN--BCHER-KVA.example.test:443/a/../exact?phase=one",
        responseUrl: "https://bücher.example.test/exact?phase=one",
        status: 200,
        finalPageUrl: "https://xn--bcher-kva.example.test/exact?phase=one",
      }),
    ).not.toThrow();
  });

  it("cannot emit a PASS before every command case is proven", () => {
    const root = mkdtempSync(join(tmpdir(), "readmates-cache-evidence-"));
    const env = evidenceEnv(root);

    expect(() => writePassingCacheSafetyReport("seed-r2a-prechange-cache", new Set(), env)).toThrow(
      "causally proven",
    );
    expect(() => readFileSync(env.READMATES_HOST_ROLLOUT_CASE_REPORT!, "utf8")).toThrow();
  });

  it("cannot label a pre-change prime as the 720-second browser proof", () => {
    const root = mkdtempSync(join(tmpdir(), "readmates-cache-evidence-"));
    const env = evidenceEnv(root);
    env.READMATES_ROLLOUT_CACHE_PHASE = "pre-change";

    expect(() =>
      writePassingCacheSafetyReport(
        "seed-r2a-prechange-cache",
        new Set(["browser-previous-policy-720s"]),
        env,
      ),
    ).toThrow("post-wait");
    expect(() => readFileSync(env.READMATES_HOST_ROLLOUT_CASE_REPORT!, "utf8")).toThrow();
  });

  it("rejects a fresh browser profile that did not carry the primed artifact marker", () => {
    const root = mkdtempSync(join(tmpdir(), "readmates-cache-evidence-"));
    const env = evidenceEnv(root);
    writeFileSync(
      env.READMATES_HOST_ROLLOUT_PRIMED_BROWSER_STATE!,
      JSON.stringify({
        schemaVersion: "readmates.public-cache.prime.v1",
        artifactId: "artifact-example",
        profileNonce: "profile_nonce_1234",
        primeUrl: "https://cdn.example.test/api/bff/api/public/clubs/example/sessions/revoked",
        oldGenerationEtag: '"public-record-g4-r0"',
        primedAt: "2026-08-24T00:00:00Z",
      }),
    );

    expect(() => readVerifiedPrimedBrowserState(requireCacheSafetyEvidenceConfig("seed-r2a-prechange-cache", env))).toThrow(
      "profile marker is missing",
    );
  });

  it("rejects an incomplete 720-second wait", () => {
    const root = mkdtempSync(join(tmpdir(), "readmates-cache-evidence-"));
    const env = evidenceEnv(root);
    env.READMATES_HOST_ROLLOUT_WAIT_COMPLETED_AT = "2026-08-24T00:12:59Z";

    expect(() => readVerifiedPrimedBrowserState(requireCacheSafetyEvidenceConfig("seed-r2a-prechange-cache", env))).toThrow(
      "720-second",
    );
  });

  it("writes exact PASS JSON only from a carried post-wait browser profile", () => {
    const root = mkdtempSync(join(tmpdir(), "readmates-cache-evidence-"));
    const env = evidenceEnv(root);
    env.READMATES_ROLLOUT_CACHE_PHASE = "pre-change";
    const primeConfig = requireCacheSafetyEvidenceConfig("seed-r2a-prechange-cache", env);
    writePrimedBrowserState(primeConfig, {
      schemaVersion: "readmates.public-cache.prime.v1",
      artifactId: "artifact-example",
      profileNonce: "profile_nonce_1234",
      primeUrl: "https://cdn.example.test/api/bff/api/public/clubs/example/sessions/revoked",
      oldGenerationEtag: '"public-record-g4-r0"',
      primedAt: "2026-08-24T00:00:00Z",
    });
    env.READMATES_ROLLOUT_CACHE_PHASE = "post-wait";

    writePassingCacheSafetyReport(
      "seed-r2a-prechange-cache",
      new Set(["browser-previous-policy-720s"]),
      env,
    );

    const report = JSON.parse(readFileSync(env.READMATES_HOST_ROLLOUT_CASE_REPORT!, "utf8"));
    expect(report.commands).toEqual([
      { id: "seed-r2a-prechange-cache", result: "PASS", source: "structured-test-reporter" },
    ]);
    expect(report.cases).toEqual([
      { id: "browser-previous-policy-720s", result: "PASS", commandId: "seed-r2a-prechange-cache" },
    ]);
  });
});
