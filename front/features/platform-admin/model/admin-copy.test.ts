import { describe, expect, it } from "vitest";
import {
  ADMIN_COPY,
  aiJobConfirmAction,
  aiJobInProgressLabel,
  aiJobStallLabel,
  auditOutcomeLabel,
  clubLifecycleLabel,
  clubVisibilityLabel,
  deliveryAttemptBadge,
  deliveryLedgerStatusLabel,
  hostOnboardingLabel,
  supportGrantReasonLabel,
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
    expect(ADMIN_COPY.eyebrow.pipeline).toBe("파이프라인");
    expect(ADMIN_COPY.eyebrow.ledger).toBe("원장");
    expect(ADMIN_COPY.search.loadedCases).toBe("이미 불러온 케이스 검색");
    expect(ADMIN_COPY.heading.aiOps).toBe("AI 작업");
    expect(ADMIN_COPY.heading.failureClusters).toBe("실패 클러스터");
    expect(ADMIN_COPY.heading.replay).toBe("재발송");
    expect(ADMIN_COPY.heading.clubsLedger).toBe("클럽 장부");
    expect(ADMIN_COPY.heading.delivery).toBe("배달 원장");
    expect(ADMIN_COPY.heading.recentChanges).toBe("최근에 바뀐 것");
    expect(ADMIN_COPY.heading.audit).toBe("운영 기입");
    expect(ADMIN_COPY.heading.auditLedger).toBe("기입 목록");
    expect(ADMIN_COPY.heading.access).toBe("접근 원장");
    expect(ADMIN_COPY.heading.accessLedger).toBe("발급 목록");
    expect(ADMIN_COPY.heading.analytics).toBe("분석 부록");
    expect(ADMIN_COPY.support.issue).toBe("지원 접근 발급");
    expect(ADMIN_COPY.support.count).toBe("접근 발급");
    expect(ADMIN_COPY.support.unavailable).toBe("접근 발급 확인 불가");
    expect(ADMIN_COPY.support.retry).toBe("접근 발급 다시 시도");
    expect(ADMIN_COPY.targetLedger.heading).toBe("이 대상의 최근 기입");
    expect(ADMIN_COPY.targetLedger.clubHeading).toBe("이 클럽의 최근 기입");
    expect(ADMIN_COPY.targetLedger.more).toBe("전체 기입 보기");
    expect(ADMIN_COPY.targetLedger.empty).toBe("표시할 기입이 없습니다.");
    expect(ADMIN_COPY.metric.outboxPending).toBe("발송 대기");
    expect(ADMIN_COPY.metric.outboxFailed).toBe("발송 실패");
    expect(ADMIN_COPY.metric.deliveryPending).toBe("배달 대기");
    expect(ADMIN_COPY.metric.deliveryFailed).toBe("배달 실패");
    expect(ADMIN_COPY.metric.relayStale).toBe("중계 지연");
    expect(ADMIN_COPY.receipt).toBe("영수증");
    expect(ADMIN_COPY.queueExit.acknowledge).toBe("확인 처리");
    expect(ADMIN_COPY.queueExit.hold).toBe("보류");
    expect(ADMIN_COPY.queueExit.ignore).toBe("무시");
    expect(ADMIN_COPY.queueExit.resolve).toBe("해결 확인");
    expect(ADMIN_COPY.queueExit.holdDuration).toBe("보류 기간");
    expect(ADMIN_COPY.queueExit.holdConfirm).toBe("보류 확정");
    expect(ADMIN_COPY.queueExit.ignoreConfirm).toBe("무시 확정");
    expect(ADMIN_COPY.alarm.attention).toBe("주의");
    expect(ADMIN_COPY.alarm.noUnacknowledged).toBe("미확인 신호 없음");
    expect(ADMIN_COPY.alarm.serviceOk).toBe("서비스 정상");
    expect(ADMIN_COPY.alarm.unavailable).toBe("신호 확인 불가");
    expect(ADMIN_COPY.alarm.openToday).toBe("오늘 열기");
    expect(ADMIN_COPY.replayWarning).toBe("수동 재발송은 자동 재시도를 취소하지 않습니다.");
    expect(ADMIN_COPY.nextRetry).toBe("다음 재시도 예정");
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

  it("지원 발급 상태를 한국어 라벨로 바꾼다", () => {
    expect(supportGrantStatusLabel("ACTIVE")).toBe("활성");
    expect(supportGrantStatusLabel("EXPIRING")).toBe("만료 임박");
    expect(supportGrantStatusLabel("EXPIRED")).toBe("만료됨");
    expect(supportGrantStatusLabel("REVOKED")).toBe("취소됨");
  });

  it("지원 발급 사유를 한국어 라벨로 바꾼다", () => {
    expect(supportGrantReasonLabel("INCIDENT_INVESTIGATION")).toBe("사고 조사");
    expect(supportGrantReasonLabel("MEMBER_ASSISTANCE")).toBe("회원 지원");
    expect(supportGrantReasonLabel("DATA_CORRECTION")).toBe("데이터 정정");
    expect(supportGrantReasonLabel("SECURITY_REVIEW")).toBe("보안 검토");
  });

  it("모르는 값은 원문을 그대로 반환한다 (fail-open 라벨, 숨기지 않음)", () => {
    expect(clubLifecycleLabel("UNKNOWN_X")).toBe("UNKNOWN_X");
    expect(supportGrantStatusLabel("")).toBe("");
    expect(auditOutcomeLabel("WEIRD")).toBe("WEIRD");
  });

  it("감사 결과를 성공/실패/차단/진행으로 바꾼다", () => {
    expect(auditOutcomeLabel("SUCCESS")).toBe("성공");
    expect(auditOutcomeLabel("FAILED")).toBe("실패");
    expect(auditOutcomeLabel("DENIED")).toBe("차단");
    expect(auditOutcomeLabel("PREPARED")).toBe("진행");
    expect(auditOutcomeLabel("UNKNOWN")).toBe("UNKNOWN");
  });

  it("배달 원장 상태를 발송됨/대기/실패로 바꾼다", () => {
    expect(deliveryLedgerStatusLabel("SENT")).toBe("발송됨");
    expect(deliveryLedgerStatusLabel("PUBLISHED")).toBe("발송됨");
    expect(deliveryLedgerStatusLabel("PENDING")).toBe("대기");
    expect(deliveryLedgerStatusLabel("PUBLISHING")).toBe("대기");
    expect(deliveryLedgerStatusLabel("SENDING")).toBe("대기");
    expect(deliveryLedgerStatusLabel("FAILED")).toBe("실패");
    expect(deliveryLedgerStatusLabel("DEAD")).toBe("실패");
    expect(deliveryLedgerStatusLabel("SKIPPED")).toBe("SKIPPED");
    expect(deliveryAttemptBadge(2)).toBe("2차 시도");
  });

  it("AI 작업 경과·멈춤·확인 문장을 고정 형식으로 만든다", () => {
    expect(aiJobInProgressLabel(5)).toBe("5분째 진행");
    expect(aiJobStallLabel(20)).toBe("멈춤 의심 · 20분");
    expect(aiJobConfirmAction("job-1", "FORCE_CANCEL")).toBe("작업 job-1 강제 취소");
    expect(aiJobConfirmAction("job-2", "RETRY_COMMIT")).toBe("작업 job-2 커밋 복구");
  });
});
