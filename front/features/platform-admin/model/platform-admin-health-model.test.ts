import { describe, expect, it } from "vitest";
import type { HealthCard } from "./platform-admin-health-model";
import {
  formatHealthNarrative,
  healthCardEvidenceState,
  healthFreshnessLabel,
  partitionHealthServiceCards,
} from "./platform-admin-health-model";

describe("healthFreshnessLabel", () => {
  it("uses approved availability semantics without inventing normal or zero", () => {
    expect((["FRESH", "REFRESHING", "STALE", "UNAVAILABLE"] as const).map(healthFreshnessLabel)).toEqual([
      "최신",
      "갱신 중",
      "오래됨",
      "확인 불가",
    ]);
  });
});

function card(overrides: Partial<HealthCard> & Pick<HealthCard, "id" | "title">): HealthCard {
  return {
    status: "OK",
    metric: { value: 1, unit: "rows", label: "pending" },
    thresholds: { warn: 10, crit: 20 },
    lastCheckedAt: "2026-05-26T00:00:00Z",
    source: "IN_PROCESS",
    drill: null,
    reason: null,
    deployStrip: null,
    ...overrides,
  };
}

const OK_OUTBOX = card({ id: "outbox_backlog", title: "Outbox backlog" });
const OK_RATIO = card({
  id: "notification_dispatch_success",
  title: "Notification dispatch success",
  metric: { value: 0.997, unit: "ratio", label: "last 5m" },
  source: "PROMETHEUS",
});
const WARN_KAFKA = card({
  id: "kafka_consumer_lag",
  title: "Kafka consumer lag",
  status: "WARN",
  metric: { value: 75, unit: "records", label: "max across partitions" },
  source: "PROMETHEUS",
});
const DEPLOY = card({
  id: "deploy_attempts_strip",
  title: "Deploy attempts",
  source: "FILE",
  metric: null,
  thresholds: null,
  deployStrip: [],
});

describe("formatHealthNarrative", () => {
  it("uses only the all-ok sentence when last-incident data is absent", () => {
    expect(formatHealthNarrative([OK_OUTBOX, OK_RATIO, DEPLOY])).toBe("모든 신호 정상.");
  });

  it("does not invent a last-incident timestamp from current ok evidence", () => {
    expect(formatHealthNarrative([OK_OUTBOX])).not.toMatch(/마지막 이상은/);
    expect(formatHealthNarrative([OK_OUTBOX])).not.toMatch(/2026/);
  });

  it("appends the resolved last incident only when that fact is supplied", () => {
    const text = formatHealthNarrative([OK_OUTBOX], {
      at: "2026-05-20T03:04:00Z",
      title: "Kafka consumer lag",
    });
    expect(text.startsWith("모든 신호 정상. 마지막 이상은 ")).toBe(true);
    expect(text.endsWith(" · Kafka consumer lag (해소됨).")).toBe(true);
    expect(text).not.toBe("모든 신호 정상.");
  });

  it("keeps the all-ok sentence when last-incident time cannot be formatted", () => {
    expect(
      formatHealthNarrative([OK_OUTBOX], { at: "not-a-timestamp", title: "Redis" }),
    ).toBe("모든 신호 정상.");
  });

  it("names the live deviation instead of claiming all signals are ok", () => {
    expect(formatHealthNarrative([OK_OUTBOX, WARN_KAFKA, DEPLOY])).toBe("Kafka consumer lag 주의.");
  });
});

describe("partitionHealthServiceCards", () => {
  it("promotes non-ok service cards and keeps ok names out of the deploy strip", () => {
    const { deviations, okSignals } = partitionHealthServiceCards([
      OK_OUTBOX,
      WARN_KAFKA,
      DEPLOY,
    ]);
    expect(deviations.map((item) => item.id)).toEqual(["kafka_consumer_lag"]);
    expect(okSignals.map((item) => item.id)).toEqual(["outbox_backlog"]);
    expect(deviations.every((item) => healthCardEvidenceState(item) !== "ok")).toBe(true);
  });
});
