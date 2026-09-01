import { describe, expect, it } from "vitest";
import type { HealthCard } from "./platform-admin-health-model";
import {
  HEALTH_CARD_IDS,
  formatHealthNarrative,
  formatRefreshStateLabel,
  healthCardEvidenceState,
  healthCardOperatorView,
  healthEvidenceLabel,
  healthFreshnessLabel,
  healthStatusSentence,
  healthPrimaryReading,
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

  it("turns every wire refresh state into a distinct operator sentence", () => {
    const base = {
      schema: "platform.health_snapshot.v1" as const,
      generatedAt: "2026-05-26T00:00:00Z",
      lastSuccessfulAt: "2026-05-26T00:00:00Z",
      staleAgeSeconds: 0,
      cards: [],
    };

    expect(formatRefreshStateLabel({ ...base, refreshState: "FRESH" })).toBe(
      "현재 자료로 확인했습니다.",
    );
    expect(formatRefreshStateLabel({ ...base, refreshState: "REFRESHING" })).toBe(
      "새 상태를 확인하고 있습니다.",
    );
    expect(
      formatRefreshStateLabel({ ...base, refreshState: "STALE", staleAgeSeconds: 125 }),
    ).toBe("마지막 확인 자료가 2분 5초 전입니다.");
    expect(
      formatRefreshStateLabel({
        ...base,
        refreshState: "UNAVAILABLE",
        lastSuccessfulAt: null,
      }),
    ).toBe("최근 상태 자료를 확인할 수 없습니다.");
  });
});

describe("healthStatusSentence", () => {
  it("turns every wire status into a distinct intuitive sentence", () => {
    expect((['OK', 'WARN', 'CRIT', 'UNKNOWN'] as const).map(healthStatusSentence)).toEqual([
      "현재 정상 범위입니다.",
      "주의해서 살펴봐야 합니다.",
      "지금 확인이 필요합니다.",
      "상태를 확인할 수 없습니다",
    ]);
  });
});

describe("disabled health semantics", () => {
  it("uses the central 사용 안 함 label without collapsing unavailable or empty", () => {
    const disabled = card({ id: "redis", title: "Redis", status: "UNKNOWN", metric: null, reason: "redis_disabled" });
    expect(healthCardEvidenceState(disabled)).toBe("disabled");
    expect(healthEvidenceLabel("disabled")).toBe("사용 안 함");
    expect(healthPrimaryReading(disabled)).toBe("사용 안 함");
    expect(healthEvidenceLabel("unavailable")).toBe("확인 불가");
    expect(healthEvidenceLabel("empty")).toBe("없음");
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
    expect(formatHealthNarrative([OK_OUTBOX, OK_RATIO, DEPLOY])).toBe(
      "모든 서비스가 정상 범위입니다. 현재 자료로 확인했습니다.",
    );
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
    expect(text.startsWith("모든 서비스가 정상 범위입니다. 현재 자료로 확인했습니다. 마지막 이상은 ")).toBe(true);
    expect(text.endsWith(" · Kafka consumer lag (해소됨).")).toBe(true);
    expect(text).not.toBe("모든 서비스가 정상 범위입니다. 현재 자료로 확인했습니다.");
  });

  it("keeps the all-ok sentence when last-incident time cannot be formatted", () => {
    expect(
      formatHealthNarrative([OK_OUTBOX], { at: "not-a-timestamp", title: "Redis" }),
    ).toBe("모든 서비스가 정상 범위입니다. 현재 자료로 확인했습니다.");
  });

  it("names the live deviation instead of claiming all signals are ok", () => {
    expect(formatHealthNarrative([OK_OUTBOX, WARN_KAFKA, DEPLOY])).toBe(
      "주의해서 살펴볼 서비스가 1곳 있습니다. 현재 자료로 확인했습니다.",
    );
  });

  it("does not claim current normality when the snapshot is stale or unavailable", () => {
    expect(formatHealthNarrative([OK_OUTBOX], null, "STALE")).toBe(
      "현재 확인된 서비스는 정상 범위지만 자료가 오래되었습니다.",
    );
    expect(formatHealthNarrative([OK_OUTBOX], null, "UNAVAILABLE")).toBe(
      "최근 상태 자료를 확인할 수 없어 정상 여부를 확정할 수 없습니다.",
    );
  });

  it.each([
    ["WARN", WARN_KAFKA, "주의해서 살펴볼 서비스가 1곳 있습니다."],
    ["CRIT", card({ id: "redis", title: "Redis", status: "CRIT" }), "지금 확인이 필요한 서비스가 1곳 있습니다."],
    ["empty", card({ id: "redis", title: "Redis", status: "UNKNOWN", metric: null, reason: "no_data" }), "일부 서비스는 아직 판단할 자료가 없습니다."],
    ["disabled", card({ id: "redis", title: "Redis", status: "UNKNOWN", metric: null, reason: "redis_disabled" }), "사용하지 않는 서비스가 1곳 있습니다."],
  ] as const)("keeps stale %s deviations while refusing a current-evidence claim", (_kind, deviation, prefix) => {
    const narrative = formatHealthNarrative([OK_OUTBOX, deviation, DEPLOY], null, "STALE");

    expect(narrative).toBe(`${prefix} 마지막 확인 자료가 오래되었습니다.`);
    expect(narrative).not.toContain("현재 자료");
  });

  it("keeps refreshing and unavailable deviation freshness truthful", () => {
    expect(formatHealthNarrative([OK_OUTBOX, WARN_KAFKA, DEPLOY], null, "REFRESHING")).toBe(
      "주의해서 살펴볼 서비스가 1곳 있습니다. 새 상태를 확인하고 있습니다.",
    );
    expect(formatHealthNarrative([OK_OUTBOX, WARN_KAFKA, DEPLOY], null, "UNAVAILABLE")).toBe(
      "주의해서 살펴볼 서비스가 1곳 있습니다. 최근 상태 자료를 확인할 수 없어 정상 여부를 확정할 수 없습니다.",
    );
  });

  it("does not collapse a disabled and OK source mix into all-normal", () => {
    const disabledRedis = card({
      id: "redis",
      title: "Redis",
      status: "UNKNOWN",
      metric: null,
      reason: "redis_disabled",
    });

    expect(formatHealthNarrative([OK_OUTBOX, disabledRedis, DEPLOY])).toBe(
      "사용하지 않는 서비스가 1곳 있습니다. 현재 자료로 확인했습니다.",
    );
  });
});

describe("health card operator view", () => {
  it("keeps the exact current server source allowlist and does not invent API latency", () => {
    expect(HEALTH_CARD_IDS).toEqual([
      "db_pool",
      "redis",
      "kafka_consumer_lag",
      "outbox_backlog",
      "notification_dispatch_success",
      "ai_provider_availability",
      "outbound-resilience",
      "deploy_attempts_strip",
    ]);
    expect(HEALTH_CARD_IDS).not.toContain("api_latency");
  });

  it("maps every known abnormal source to public-safe impact and next action", () => {
    const known = HEALTH_CARD_IDS.map((id) => healthCardOperatorView(card({
      id,
      title: `wire ${id}`,
      status: "WARN",
    })));

    expect(known.every((item) => item.knownSource)).toBe(true);
    expect(known.map((item) => item.label)).toEqual([
      "데이터베이스 연결",
      "Redis",
      "AI 작업 대기열",
      "알림 대기열",
      "알림 전송",
      "AI 제공자",
      "외부 연결 보호",
      "배포 기록",
    ]);
    expect(known.every((item) => item.impact && item.nextAction)).toBe(true);
  });

  it("fails closed for an unknown source without fabricating impact or action", () => {
    const view = healthCardOperatorView(card({
      id: "api_latency",
      title: "API latency",
      status: "OK",
    }));

    expect(view).toMatchObject({
      knownSource: false,
      label: "알 수 없는 서비스",
      stateSentence: "상태를 확인할 수 없습니다",
      impact: null,
      nextAction: null,
    });
    expect(healthCardEvidenceState(card({
      id: "api_latency",
      title: "API latency",
      status: "OK",
    }))).toBe("unavailable");
  });

  it("derives disabled and no-data as view semantics without new wire enum values", () => {
    const disabled = healthCardOperatorView(card({
      id: "redis",
      title: "Redis",
      status: "UNKNOWN",
      metric: null,
      reason: "redis_disabled",
    }));
    const noData = healthCardOperatorView(card({
      id: "ai_provider_availability",
      title: "AI provider availability",
      status: "UNKNOWN",
      metric: null,
      reason: "no_data",
    }));

    expect(disabled.evidence).toBe("disabled");
    expect(disabled.stateSentence).toBe("현재 운영 설정에서 사용하지 않습니다.");
    expect(noData.evidence).toBe("empty");
    expect(noData.stateSentence).toBe("아직 판단할 자료가 없습니다.");
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
