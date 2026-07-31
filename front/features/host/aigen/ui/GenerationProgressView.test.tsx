import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AiGenerationJobResponse, AiGenerationStage } from "../api/aigen-contracts";
import { GenerationProgressView } from "./GenerationProgressView";

describe("GenerationProgressView", () => {
  it("renders 25 percent as a left-origin transform without a width transition", () => {
    const job: AiGenerationJobResponse = {
      jobId: "job-progress",
      status: "RUNNING",
      stage: "GENERATING_SUMMARY",
      progressPct: 25,
      model: "test-model",
      result: null,
      error: null,
      tokens: null,
      costEstimateUsd: "0",
      warnings: [],
    };

    render(<GenerationProgressView job={job} cancelling={false} onCancel={() => {}} />);

    const progressbar = screen.getByRole("progressbar", { name: "생성 진행률" });
    const fill = progressbar.firstElementChild;
    expect(progressbar).toHaveAttribute("aria-valuemin", "0");
    expect(progressbar).toHaveAttribute("aria-valuemax", "100");
    expect(progressbar).toHaveAttribute("aria-valuenow", "25");
    expect(fill).toHaveStyle({
      width: "100%",
      transform: "scaleX(0.25)",
      transformOrigin: "left center",
      transition: "transform 200ms linear",
    });
    expect(fill).not.toHaveStyle({ transition: "width 200ms linear" });
  });

  it.each([
    { progressPct: -10, expectedPct: 0, expectedScale: "scaleX(0)" },
    { progressPct: 135, expectedPct: 100, expectedScale: "scaleX(1)" },
  ])(
    "clamps $progressPct percent to $expectedPct for visual and accessible progress",
    ({ progressPct, expectedPct, expectedScale }) => {
      const job: AiGenerationJobResponse = {
        jobId: "job-clamped-progress",
        status: "RUNNING",
        stage: "GENERATING_SUMMARY",
        progressPct,
        model: "test-model",
        result: null,
        error: null,
        tokens: null,
        costEstimateUsd: "0",
        warnings: [],
      };

      render(<GenerationProgressView job={job} cancelling={false} onCancel={() => {}} />);

      const progressbar = screen.getByRole("progressbar", { name: "생성 진행률" });
      expect(progressbar).toHaveAttribute("aria-valuenow", String(expectedPct));
      expect(progressbar.firstElementChild).toHaveStyle({ transform: expectedScale });
    },
  );

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
