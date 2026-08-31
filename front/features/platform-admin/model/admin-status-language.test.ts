import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  adminAuditOutcomeLanguage,
  adminCaseLifecycleLanguage,
  adminHealthAvailabilityLanguage,
  adminHealthFreshnessLanguage,
  adminNavigationLanguage,
  adminPlatformRoleLanguage,
} from "./admin-status-language";

describe("admin-status-language", () => {
  it("네 운영 축을 route나 영문 제품명이 아닌 운영자 언어로 고정한다", () => {
    expect(adminNavigationLanguage("today").primaryText).toBe("오늘 할 일");
    expect(adminNavigationLanguage("clubs").primaryText).toBe("클럽 관리");
    expect(adminNavigationLanguage("service").primaryText).toBe("서비스 상태");
    expect(adminNavigationLanguage("records").primaryText).toBe("처리 기록");
    expect(adminNavigationLanguage("emergency").primaryText).toBe("긴급 공개 회수");
  });

  it("케이스 lifecycle을 다음 행동과 같은 짧은 한국어로 설명한다", () => {
    expect(adminCaseLifecycleLanguage("OPEN").primaryText).toBe("확인 전");
    expect(adminCaseLifecycleLanguage("ACKNOWLEDGED").primaryText).toBe("확인함");
    expect(adminCaseLifecycleLanguage("SNOOZED").primaryText).toBe("잠시 미룸");
    expect(adminCaseLifecycleLanguage("RESOLVED").primaryText).toBe("처리함");
  });

  it("platform role은 권한 추론이 아닌 명시적 detail 라벨로만 번역한다", () => {
    expect(adminPlatformRoleLanguage("OWNER").primaryText).toBe("소유자");
    expect(adminPlatformRoleLanguage("OPERATOR").primaryText).toBe("운영자");
    expect(adminPlatformRoleLanguage("SUPPORT").primaryText).toBe("지원 담당");
  });

  it("audit outcome은 결과 불명을 성공이나 진행 중으로 축약하지 않는다", () => {
    expect(adminAuditOutcomeLanguage("SUCCESS").primaryText).toBe("완료");
    expect(adminAuditOutcomeLanguage("FAILED").primaryText).toBe("실패");
    expect(adminAuditOutcomeLanguage("DENIED").primaryText).toBe("차단됨");
    expect(adminAuditOutcomeLanguage("PREPARED").primaryText).toBe("실행 전 준비됨");
    expect(adminAuditOutcomeLanguage("UNKNOWN").primaryText).toBe("결과 확인 필요");
  });

  it("health availability와 freshness를 0건이나 정상으로 합치지 않는다", () => {
    expect(adminHealthAvailabilityLanguage("AVAILABLE").primaryText).toBe("확인 가능");
    expect(adminHealthAvailabilityLanguage("PARTIAL").primaryText).toBe("일부 확인 불가");
    expect(adminHealthAvailabilityLanguage("UNAVAILABLE").primaryText).toBe("확인 불가");
    expect(adminHealthAvailabilityLanguage("DISABLED").primaryText).toBe("사용 안 함");
    expect(adminHealthFreshnessLanguage("FRESH").primaryText).toBe("최신");
    expect(adminHealthFreshnessLanguage("REFRESHING").primaryText).toBe("갱신 중");
    expect(adminHealthFreshnessLanguage("STALE").primaryText).toBe("오래됨");
    expect(adminHealthFreshnessLanguage("UNAVAILABLE").primaryText).toBe("확인 불가");
  });

  it("unknown raw 값은 primary에서 숨기고 명시적 기술 정보 필드로만 제공한다", () => {
    const unknown = adminHealthFreshnessLanguage("FUTURE_STATE");

    expect(unknown.primaryText).toBe("확인 필요");
    expect(unknown.primaryText).not.toContain("FUTURE_STATE");
    expect(unknown.technicalDisclosure).toEqual({ label: "기술 값", value: "FUTURE_STATE" });
    expect(adminPlatformRoleLanguage("").technicalDisclosure).toBeNull();
  });

  it("primary source에 금지된 영문 제품 라벨을 다시 넣지 않는다", () => {
    const root = path.resolve("features/platform-admin");
    const banned = /\b(?:Today|Club registry|Pipeline|Ledger|Job|Event)\b/;
    const explicitTechnicalDisclosureLines = new Set([
      "ui/admin-audit-ledger.tsx:{item.target.jobId ? <div><dt>Job</dt><dd>{item.target.jobId}</dd></div> : null}",
      "ui/admin-audit-ledger.tsx:{item.target.eventId ? <div><dt>Event</dt><dd>{item.target.eventId}</dd></div> : null}",
      "ui/platform-admin-ai-ops.tsx:<p className=\"eyebrow\">Job drill-down</p>",
      "ui/platform-admin-ai-ops.tsx:<div><dt>Job ID</dt><dd>{job.jobId}</dd></div>",
    ]);

    const violations = productionSources(root).flatMap((absolutePath) => {
      const relativePath = path.relative(root, absolutePath);
      return readFileSync(absolutePath, "utf8")
        .split("\n")
        .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
        .filter(({ line }) => banned.test(line))
        .filter(({ line }) => !explicitTechnicalDisclosureLines.has(`${relativePath}:${line}`))
        .map(({ line, lineNumber }) => `${relativePath}:${lineNumber}:${line}`);
    });

    expect(violations).toEqual([]);
  });
});

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(absolutePath);
    if (!/\.(?:ts|tsx)$/.test(entry.name)) return [];
    if (/\.(?:test|ct|fixtures)\.(?:ts|tsx)$/.test(entry.name)) return [];
    return [absolutePath];
  });
}
