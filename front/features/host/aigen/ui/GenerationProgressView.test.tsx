import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AiGenerationJobResponse, AiGenerationStage } from "../api/aigen-contracts";
import { GenerationProgressView } from "./GenerationProgressView";

describe("GenerationProgressView", () => {
  it("shows a generic progress label for a future server stage", () => {
    const job: AiGenerationJobResponse = {
      jobId: "job-public-safe",
      status: "RUNNING",
      stage: "FUTURE_SERVER_STAGE" as AiGenerationStage,
      progressPct: 25,
      model: "test-model",
      result: null,
      error: null,
      tokens: null,
      costEstimateUsd: "0",
      warnings: [],
    };

    render(<GenerationProgressView job={job} cancelling={false} onCancel={() => {}} />);

    expect(screen.getByText(/생성 진행 중 · 경과/)).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });
});
