import { readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createHostRolloutEvidence,
  writeHostRolloutEvidence,
} from "./host-rollout-evidence";

describe("host rollout compatibility evidence", () => {
  it("keeps only bounded case, layer, generation, and status observations", () => {
    const evidence = createHostRolloutEvidence([
      {
        caseId: "browser-v3-bff-v2v3-backend-support",
        layer: "backend",
        generation: "v3",
        status: 200,
      },
      {
        caseId: "notification-confirm",
        layer: "browser",
        generation: "v3",
        status: 200,
      },
    ]);

    expect(evidence).toEqual({
      schemaVersion: "readmates.host-rollout.local-observation.v1",
      cases: [
        {
          caseId: "browser-v3-bff-v2v3-backend-support",
          layer: "backend",
          generation: "v3",
          status: 200,
        },
        {
          caseId: "notification-confirm",
          layer: "browser",
          generation: "v3",
          status: 200,
        },
      ],
    });
    expect(JSON.stringify(evidence)).not.toMatch(
      /PASS|secret|password|token|tracepath|actorid|memberid|resourceid|https?:|@|\.example/i,
    );
  });

  it("rejects duplicate, unknown, or unbounded observations", () => {
    expect(() =>
      createHostRolloutEvidence([
        {
          caseId: "notification-preview",
          layer: "browser",
          generation: "v3",
          status: 200,
        },
        {
          caseId: "notification-preview",
          layer: "browser",
          generation: "v3",
          status: 200,
        },
      ]),
    ).toThrow("duplicate case observation");

    expect(() =>
      createHostRolloutEvidence([
        {
          caseId: "private-host-observation",
          layer: "browser",
          generation: "v3",
          status: 200,
        },
      ]),
    ).toThrow("unknown compatibility case");

    expect(() =>
      createHostRolloutEvidence([
        {
          caseId: "notification-preview",
          layer: "browser",
          generation: "v3",
          status: 999,
        },
      ]),
    ).toThrow("invalid response status");

    expect(() =>
      createHostRolloutEvidence([
        {
          caseId: "notification-preview",
          layer: "private-browser",
          generation: "v3",
          status: 200,
        },
      ]),
    ).toThrow("invalid evidence layer");

    expect(() =>
      createHostRolloutEvidence([
        {
          caseId: "notification-preview",
          layer: "browser",
          generation: "future",
          status: 200,
        },
      ]),
    ).toThrow("invalid client generation");
  });

  it("writes deterministic structured JSON only to an explicit ignored-output target", () => {
    const target = resolve("output/host-rollout/test/compatibility.observation.json");
    const evidence = createHostRolloutEvidence([
      {
        caseId: "notification-policy",
        layer: "browser",
        generation: "v3",
        status: 200,
      },
    ]);

    try {
      writeHostRolloutEvidence(target, evidence);
      expect(readFileSync(target, "utf8")).toBe(`${JSON.stringify(evidence, null, 2)}\n`);
      expect(statSync(target).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(target, { force: true });
    }

    expect(() =>
      writeHostRolloutEvidence(
        join(tmpdir(), "compatibility.observation.json"),
        evidence,
      ),
    ).toThrow("outside ignored rollout output");
  });
});
