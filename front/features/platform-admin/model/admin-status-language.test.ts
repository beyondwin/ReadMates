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
  adminSupportCommandOutcomeLanguage,
  adminSupportReceiptStatusLanguage,
} from "./admin-status-language";
import { analyzeAdminPrimaryLanguageSource } from "./admin-primary-language-source-analyzer.test-support";

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

  it("support receipt outcome과 status도 unknown-safe 중앙 의미를 사용한다", () => {
    expect((["SUCCEEDED", "PARTIAL", "FAILED"] as const).map((value) => adminSupportCommandOutcomeLanguage(value).primaryText)).toEqual([
      "완료",
      "일부 처리됨",
      "실패",
    ]);
    expect((["ABSENT", "ACTIVE", "EXPIRING", "EXPIRED", "REVOKED"] as const).map((value) => adminSupportReceiptStatusLanguage(value).primaryText)).toEqual([
      "없음",
      "활성",
      "만료 임박",
      "만료됨",
      "취소됨",
    ]);
    expect(adminSupportCommandOutcomeLanguage("FUTURE_OUTCOME").primaryText).toBe("확인 필요");
    expect(adminSupportReceiptStatusLanguage("FUTURE_STATUS").primaryText).toBe("확인 필요");
  });

  it.each([
    ["direct JSX text", "export const View = () => <h1>Today</h1>"],
    ["concatenated copy", 'export const View = () => <h1>{"To" + "day"}</h1>'],
    ["split template copy", 'export const View = () => <h1>{`Pi${"pe"}line`}</h1>'],
    ["raw property", "export const View = ({ job }: any) => <p>{job.status}</p>"],
    ["raw destructured alias", "export const View = ({ status: state }: any) => <p>{state}</p>"],
    ["primary drill-down", "export const View = () => <p>Job drill-down</p>"],
  ])("detects %s instead of relying on line allowlists", (_name, source) => {
    expect(analyzeAdminPrimaryLanguageSource(source).violations).not.toEqual([]);
  });

  it("allows raw values only inside the structural technical disclosure boundary", () => {
    const analysis = analyzeAdminPrimaryLanguageSource(
      `import { AdminTechnicalDisclosure as Tech } from "@/features/platform-admin/ui/admin-technical-disclosure";
       export const View = ({ job }: any) => <Tech items={[{ label: '작업 상태', value: job.status }]} />`,
    );
    expect(analysis).toEqual({ violations: [], technicalDisclosureCount: 1 });
  });

  it.each([
    ["local fake", "const AdminTechnicalDisclosure = (props: any) => <div />; export const View = ({ status }: any) => <AdminTechnicalDisclosure>{status}</AdminTechnicalDisclosure>"],
    ["wrong import", "import { AdminTechnicalDisclosure } from './fake'; export const View = ({ status }: any) => <AdminTechnicalDisclosure>{status}</AdminTechnicalDisclosure>"],
    ["support raw status", "export const View = ({ receipt }: any) => <section>{receipt.outcome} · {receipt.status}</section>"],
    ["domain raw role", "export const View = ({ domain }: any) => <section>{domain.role}</section>"],
  ])("does not exempt %s from raw primary analysis", (_name, source) => {
    const analysis = analyzeAdminPrimaryLanguageSource(source, "ui/arbitrary-production.tsx");
    expect(analysis.violations).not.toEqual([]);
    expect(analysis.technicalDisclosureCount).toBe(0);
  });

  it("primary source에 금지된 영문 제품 라벨과 raw role/status render를 다시 넣지 않는다", () => {
    const root = path.resolve("features/platform-admin");
    let disclosureCount = 0;
    const violations = productionSources(root).flatMap((absolutePath) => {
      const relativePath = path.relative(root, absolutePath);
      const analysis = analyzeAdminPrimaryLanguageSource(readFileSync(absolutePath, "utf8"), relativePath);
      disclosureCount += analysis.technicalDisclosureCount;
      return analysis.violations.map(({ line, reason }) => `${relativePath}:${line}:${reason}`);
    });

    expect(violations).toEqual([]);
    expect(disclosureCount).toBeGreaterThan(0);
  });
});

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(absolutePath);
    if (!/\.(?:ts|tsx)$/.test(entry.name)) return [];
    if (/\.(?:test|ct|fixtures|test-support)\.(?:ts|tsx)$/.test(entry.name)) return [];
    return [absolutePath];
  });
}
