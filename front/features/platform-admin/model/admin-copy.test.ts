import { describe, expect, it } from "vitest";
import {
  ADMIN_COPY,
  clubLifecycleLabel,
  clubVisibilityLabel,
  hostOnboardingLabel,
  supportGrantStatusLabel,
} from "./admin-copy";

describe("admin-copy", () => {
  it("영문 eyebrow를 한국어 사전으로 제공한다", () => {
    expect(ADMIN_COPY.eyebrow.clubs).toBe("운영 · 클럽");
    expect(ADMIN_COPY.eyebrow.clubDetail).toBe("운영 · 클럽 상세");
    expect(ADMIN_COPY.eyebrow.aiOps).toBe("운영 · AI 작업");
    expect(ADMIN_COPY.eyebrow.notifications).toBe("운영 · 배달");
    expect(ADMIN_COPY.eyebrow.takedown).toBe("운영 · 긴급 공개 회수");
    expect(ADMIN_COPY.eyebrow.identity).toBe("식별");
    expect(ADMIN_COPY.eyebrow.visibility).toBe("공개 설정");
    expect(ADMIN_COPY.eyebrow.domainProvisioning).toBe("도메인 준비");
    expect(ADMIN_COPY.eyebrow.operationsSnapshot).toBe("운영 스냅샷");
    expect(ADMIN_COPY.heading.aiOps).toBe("AI 작업");
    expect(ADMIN_COPY.heading.failureClusters).toBe("실패 클러스터");
    expect(ADMIN_COPY.heading.replay).toBe("재발송");
    expect(ADMIN_COPY.heading.clubsLedger).toBe("클럽 장부");
    expect(ADMIN_COPY.heading.delivery).toBe("배달 원장");
    expect(ADMIN_COPY.heading.recentChanges).toBe("최근에 바뀐 것");
    expect(ADMIN_COPY.metric.outboxPending).toBe("발송 대기");
    expect(ADMIN_COPY.metric.outboxFailed).toBe("발송 실패");
    expect(ADMIN_COPY.metric.deliveryPending).toBe("배달 대기");
    expect(ADMIN_COPY.metric.deliveryFailed).toBe("배달 실패");
    expect(ADMIN_COPY.metric.relayStale).toBe("중계 지연");
    expect(ADMIN_COPY.receipt).toBe("영수증");
    expect(ADMIN_COPY.alarm.attention).toBe("주의");
    expect(ADMIN_COPY.alarm.noUnacknowledged).toBe("미확인 신호 없음");
    expect(ADMIN_COPY.alarm.serviceOk).toBe("서비스 정상");
    expect(ADMIN_COPY.alarm.unavailable).toBe("신호 확인 불가");
    expect(ADMIN_COPY.alarm.openToday).toBe("오늘 열기");
  });

  it("클럽 enum을 한국어 라벨로 바꾼다", () => {
    expect(clubLifecycleLabel("ACTIVE")).toBe("활성");
    expect(clubLifecycleLabel("SETUP_REQUIRED")).toBe("설정 필요");
    expect(clubLifecycleLabel("SUSPENDED")).toBe("중지");
    expect(clubLifecycleLabel("ARCHIVED")).toBe("보관");
    expect(clubVisibilityLabel("PUBLIC")).toBe("공개");
    expect(clubVisibilityLabel("PRIVATE")).toBe("비공개");
    expect(hostOnboardingLabel("MISSING")).toBe("없음");
    expect(hostOnboardingLabel("INVITED")).toBe("초대됨");
    expect(hostOnboardingLabel("ASSIGNED")).toBe("배정됨");
  });

  it("지원 grant 상태를 한국어 라벨로 바꾼다", () => {
    expect(supportGrantStatusLabel("ACTIVE")).toBe("활성");
    expect(supportGrantStatusLabel("EXPIRING")).toBe("만료 임박");
    expect(supportGrantStatusLabel("EXPIRED")).toBe("만료됨");
    expect(supportGrantStatusLabel("REVOKED")).toBe("취소됨");
  });

  it("모르는 값은 원문을 그대로 반환한다 (fail-open 라벨, 숨기지 않음)", () => {
    expect(clubLifecycleLabel("UNKNOWN_X")).toBe("UNKNOWN_X");
    expect(supportGrantStatusLabel("")).toBe("");
  });
});
