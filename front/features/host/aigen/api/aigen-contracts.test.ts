import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AiCommitResponseSchema,
  AiGenerationJobResponseSchema,
  AiGenerationProblemSchema,
  AiRecentJobResponseSchema,
  AvailableGenerationModelsResponseSchema,
  ClubAiDefaultResponseSchema,
  ExpandedEvidenceTurnSchema,
  RegenerateResponseSchema,
  StartGenerationResponseSchema,
} from "./aigen-contracts";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "tests/unit/__fixtures__/zod-schemas", name),
      "utf8",
    ),
  );

describe("grounded AI zod fixtures", () => {
  it.each([
    ["aigen-job.json", AiGenerationJobResponseSchema],
    ["aigen-models.json", AvailableGenerationModelsResponseSchema],
    ["aigen-regeneration.json", RegenerateResponseSchema],
    ["aigen-expanded-evidence.json", ExpandedEvidenceTurnSchema],
    ["aigen-commit-receipt.json", AiCommitResponseSchema],
    ["aigen-problem.json", AiGenerationProblemSchema],
    ["aigen-start.json", StartGenerationResponseSchema],
    ["aigen-recent-job.json", AiRecentJobResponseSchema],
    ["aigen-club-default.json", ClubAiDefaultResponseSchema],
  ])("parses %s with the corresponding runtime schema", (name, schema) => {
    expect(() => schema.parse(fixture(name))).not.toThrow();
  });
});
